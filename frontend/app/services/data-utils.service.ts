import { Injectable } from "@angular/core";

import { Observable } from "rxjs/Observable";
import "rxjs/add/observable/forkJoin";

import { Utils } from "./../utils/utils";

import { CacheService } from "./cache.service";
import { ConfigService } from "./config.service";
import { DataFormService } from "@geonature_common/form/data-form.service"


/**
 *  Ce service référence et execute les requêtes bers le serveur backend
 *  Les requêtes pour les objects de type nomenclature, utilisateurs, taxonomie ,sont mise en cache
 */
@Injectable()
export class DataUtilsService {

  constructor(
    private _cacheService: CacheService,
    private _configService: ConfigService,
    private _commonsDataFormService: DataFormService
    ) { }

/** Util (Nomenclature, User, Taxonomy) */

  /**
   * Renvoie un champ d'un objet de type nomenclare, taxonomy ou utilisateur à partir de son id
   *  
   * @param typeUtil le type de l'objet (nomenclature, taxonomy, utilisateur, ...)
   * @param id identifiant de l'objet
   * @param fieldName nom du champ requis, renvoie l'objet entier si 'all'
   */
  getUtil(typeUtil: string, id, fieldName: string) {

    if (Array.isArray(id)) {
      return this.getUtils(typeUtil, id, fieldName);
    }

    // url relative
    let urlRelative = `util/${typeUtil}/${id}`;
    // parametre pour le stockage dans le cache
    let sCachePaths = `util|${typeUtil}|${id}`;
    // récupération dans le cache ou requête si besoin
    return this._cacheService.cache_or_request('get', urlRelative, sCachePaths)
      .flatMap(
        value => {
          let out = fieldName == 'all' ? value :  value[fieldName];
          return Observable.of(out);
        }
      );
  }

  /**
   * Renvoie tableau de champs d'objets de type nomenclare, taxonomy ou utilisateur
   * 
   * @param typeUtilObject le type de l'objet (nomenclature, taxonomy, utilisateur, ...)
   * @param ids tableau d'identifiant des objets
   * @param fieldName nom du champ requis, renvoie l'objet entier si 'all' 
   */
  getUtils(typeUtilObject, ids, fieldName) {
    let observables = [];
    // applique getUtil pour chaque id de ids
    for (let id of ids) {
      observables.push(this.getUtil(typeUtilObject, id, fieldName));
    }
    // renvoie un forkJoin du tableau d'observables
    return Observable.forkJoin(observables)
      .concatMap(res => {
        return Observable.of(res.join(' ,'));
      });
  }


  /** Renvoie une nomenclature à partir de son type et son code */
  getNomenclature(typeNomenclature, codeNomenclature) {
    let urlRelative = `util/nomenclature/${typeNomenclature}/${codeNomenclature}`;
    let sCachePaths =  `util|nomenclature|${typeNomenclature}|${codeNomenclature}`;
    return this._cacheService.cache_or_request('get', urlRelative, sCachePaths);
  }

  /** Récupère les données qui seront utiles pour le module */
  getInitData(modulePath): Observable<any> {
    /** Les données à récupérer sont spécifiées dans la config du module 
     * config/<module_path>/data_config.json et 
     * config/<module_path>/custom_config.json
    */

    const configData = this._configService.configData(modulePath);
    
    let nomenclatureRequest = this._commonsDataFormService.getNomenclatures(...configData['nomenclature'])
    // Taxonomie (liste ou ensemble de )
    let TaxonomyRequests = [];
    for (let cd_nom of configData['taxonomy']['cd_noms']) {
      TaxonomyRequests.push(this._commonsDataFormService.getTaxonInfo(cd_nom));
    }

    let UserRequests = []
    for ( let bcodeList of configData['user']) {
      UserRequests.push(this._commonsDataFormService.getObserversFromCode(configData['user']))
    } 

    let observables = [nomenclatureRequest, Observable.forkJoin(TaxonomyRequests), Observable.forkJoin(UserRequests)];

    return Observable.forkJoin(observables)
      .concatMap((data) => {
        let nomenclatures = data[0];
        let taxonomy = data[1];
        let userLists = data[2];

        // mise en cache
        for (let nomenclature_type of nomenclatures) {
          for (let nomenclature of nomenclature_type.values) {
            this._cacheService.setCacheValue(`util|nomenclature|${nomenclature['id_nomenclature']}`, nomenclature);
          }
        }

        for (let userList of userLists) {
          for (let user of userList) {
          this._cacheService.setCacheValue(`util|user|${user['id_role']}`, user);
          }
        }

        for (let taxon of taxonomy) {
          this._cacheService.setCacheValue(`util|taxonomy|${taxon['cd_nom']}`, taxon);
        }

        console.log(Utils.copy(this._cacheService.cache()))

        return Observable.of(true);
      });
  }

}
