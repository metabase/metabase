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
 * The ApiUtilEntityIdPostRequest model module.
 * @module model/ApiUtilEntityIdPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiUtilEntityIdPostRequest {
    /**
     * Constructs a new <code>ApiUtilEntityIdPostRequest</code>.
     * @alias module:model/ApiUtilEntityIdPostRequest
     * @param entityIds {Object} 
     */
    constructor(entityIds) { 
        
        ApiUtilEntityIdPostRequest.initialize(this, entityIds);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, entityIds) { 
        obj['entity_ids'] = entityIds;
    }

    /**
     * Constructs a <code>ApiUtilEntityIdPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiUtilEntityIdPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiUtilEntityIdPostRequest} The populated <code>ApiUtilEntityIdPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiUtilEntityIdPostRequest();

            if (data.hasOwnProperty('entity_ids')) {
                obj['entity_ids'] = ApiClient.convertToType(data['entity_ids'], Object);
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiUtilEntityIdPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiUtilEntityIdPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiUtilEntityIdPostRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }

        return true;
    }


}

ApiUtilEntityIdPostRequest.RequiredProperties = ["entity_ids"];

/**
 * @member {Object} entity_ids
 */
ApiUtilEntityIdPostRequest.prototype['entity_ids'] = undefined;






export default ApiUtilEntityIdPostRequest;

