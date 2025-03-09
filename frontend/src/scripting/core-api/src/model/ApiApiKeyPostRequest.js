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
 * The ApiApiKeyPostRequest model module.
 * @module model/ApiApiKeyPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiApiKeyPostRequest {
    /**
     * Constructs a new <code>ApiApiKeyPostRequest</code>.
     * @alias module:model/ApiApiKeyPostRequest
     * @param groupId {Number} value must be an integer greater than zero.
     * @param name {String} 
     */
    constructor(groupId, name) { 
        
        ApiApiKeyPostRequest.initialize(this, groupId, name);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, groupId, name) { 
        obj['group_id'] = groupId;
        obj['name'] = name;
    }

    /**
     * Constructs a <code>ApiApiKeyPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiApiKeyPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiApiKeyPostRequest} The populated <code>ApiApiKeyPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiApiKeyPostRequest();

            if (data.hasOwnProperty('group_id')) {
                obj['group_id'] = ApiClient.convertToType(data['group_id'], 'Number');
            }
            if (data.hasOwnProperty('name')) {
                obj['name'] = ApiClient.convertToType(data['name'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiApiKeyPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiApiKeyPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiApiKeyPostRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['name'] && !(typeof data['name'] === 'string' || data['name'] instanceof String)) {
            throw new Error("Expected the field `name` to be a primitive type in the JSON string but got " + data['name']);
        }

        return true;
    }


}

ApiApiKeyPostRequest.RequiredProperties = ["group_id", "name"];

/**
 * value must be an integer greater than zero.
 * @member {Number} group_id
 */
ApiApiKeyPostRequest.prototype['group_id'] = undefined;

/**
 * @member {String} name
 */
ApiApiKeyPostRequest.prototype['name'] = undefined;






export default ApiApiKeyPostRequest;

