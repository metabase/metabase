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
 * The ApiCardPivotCardIdQueryPostRequest model module.
 * @module model/ApiCardPivotCardIdQueryPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiCardPivotCardIdQueryPostRequest {
    /**
     * Constructs a new <code>ApiCardPivotCardIdQueryPostRequest</code>.
     * @alias module:model/ApiCardPivotCardIdQueryPostRequest
     */
    constructor() { 
        
        ApiCardPivotCardIdQueryPostRequest.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>ApiCardPivotCardIdQueryPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiCardPivotCardIdQueryPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiCardPivotCardIdQueryPostRequest} The populated <code>ApiCardPivotCardIdQueryPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiCardPivotCardIdQueryPostRequest();

            if (data.hasOwnProperty('ignore_cache')) {
                obj['ignore_cache'] = ApiClient.convertToType(data['ignore_cache'], 'Boolean');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiCardPivotCardIdQueryPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiCardPivotCardIdQueryPostRequest</code>.
     */
    static validateJSON(data) {

        return true;
    }


}



/**
 * @member {Boolean} ignore_cache
 */
ApiCardPivotCardIdQueryPostRequest.prototype['ignore_cache'] = undefined;






export default ApiCardPivotCardIdQueryPostRequest;

