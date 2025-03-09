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
 * The ApiNotifyDbIdPostRequest model module.
 * @module model/ApiNotifyDbIdPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiNotifyDbIdPostRequest {
    /**
     * Constructs a new <code>ApiNotifyDbIdPostRequest</code>.
     * @alias module:model/ApiNotifyDbIdPostRequest
     */
    constructor() { 
        
        ApiNotifyDbIdPostRequest.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>ApiNotifyDbIdPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiNotifyDbIdPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiNotifyDbIdPostRequest} The populated <code>ApiNotifyDbIdPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiNotifyDbIdPostRequest();

            if (data.hasOwnProperty('scan')) {
                obj['scan'] = ApiClient.convertToType(data['scan'], 'String');
            }
            if (data.hasOwnProperty('table_id')) {
                obj['table_id'] = ApiClient.convertToType(data['table_id'], 'Number');
            }
            if (data.hasOwnProperty('table_name')) {
                obj['table_name'] = ApiClient.convertToType(data['table_name'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiNotifyDbIdPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiNotifyDbIdPostRequest</code>.
     */
    static validateJSON(data) {
        // ensure the json data is a string
        if (data['scan'] && !(typeof data['scan'] === 'string' || data['scan'] instanceof String)) {
            throw new Error("Expected the field `scan` to be a primitive type in the JSON string but got " + data['scan']);
        }
        // ensure the json data is a string
        if (data['table_name'] && !(typeof data['table_name'] === 'string' || data['table_name'] instanceof String)) {
            throw new Error("Expected the field `table_name` to be a primitive type in the JSON string but got " + data['table_name']);
        }

        return true;
    }


}



/**
 * @member {module:model/ApiNotifyDbIdPostRequest.ScanEnum} scan
 */
ApiNotifyDbIdPostRequest.prototype['scan'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} table_id
 */
ApiNotifyDbIdPostRequest.prototype['table_id'] = undefined;

/**
 * @member {String} table_name
 */
ApiNotifyDbIdPostRequest.prototype['table_name'] = undefined;





/**
 * Allowed values for the <code>scan</code> property.
 * @enum {String}
 * @readonly
 */
ApiNotifyDbIdPostRequest['ScanEnum'] = {

    /**
     * value: "full"
     * @const
     */
    "full": "full",

    /**
     * value: "schema"
     * @const
     */
    "schema": "schema"
};



export default ApiNotifyDbIdPostRequest;

