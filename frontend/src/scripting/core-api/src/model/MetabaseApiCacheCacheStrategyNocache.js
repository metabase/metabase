/**
 * Metabase API
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: v1.53.2-SNAPSHOT
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 *
 */

import ApiClient from '../ApiClient';

/**
 * The MetabaseApiCacheCacheStrategyNocache model module.
 * @module model/MetabaseApiCacheCacheStrategyNocache
 * @version v1.53.2-SNAPSHOT
 */
class MetabaseApiCacheCacheStrategyNocache {
    /**
     * Constructs a new <code>MetabaseApiCacheCacheStrategyNocache</code>.
     * @alias module:model/MetabaseApiCacheCacheStrategyNocache
     * @param type {Object} 
     */
    constructor(type) { 
        
        MetabaseApiCacheCacheStrategyNocache.initialize(this, type);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, type) { 
        obj['type'] = type;
    }

    /**
     * Constructs a <code>MetabaseApiCacheCacheStrategyNocache</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/MetabaseApiCacheCacheStrategyNocache} obj Optional instance to populate.
     * @return {module:model/MetabaseApiCacheCacheStrategyNocache} The populated <code>MetabaseApiCacheCacheStrategyNocache</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new MetabaseApiCacheCacheStrategyNocache();

            if (data.hasOwnProperty('type')) {
                obj['type'] = ApiClient.convertToType(data['type'], Object);
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>MetabaseApiCacheCacheStrategyNocache</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>MetabaseApiCacheCacheStrategyNocache</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of MetabaseApiCacheCacheStrategyNocache.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }

        return true;
    }


}

MetabaseApiCacheCacheStrategyNocache.RequiredProperties = ["type"];

/**
 * @member {Object} type
 */
MetabaseApiCacheCacheStrategyNocache.prototype['type'] = undefined;






export default MetabaseApiCacheCacheStrategyNocache;

