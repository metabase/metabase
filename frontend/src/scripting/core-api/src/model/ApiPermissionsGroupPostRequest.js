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
 * The ApiPermissionsGroupPostRequest model module.
 * @module model/ApiPermissionsGroupPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiPermissionsGroupPostRequest {
    /**
     * Constructs a new <code>ApiPermissionsGroupPostRequest</code>.
     * @alias module:model/ApiPermissionsGroupPostRequest
     * @param name {String} 
     */
    constructor(name) { 
        
        ApiPermissionsGroupPostRequest.initialize(this, name);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, name) { 
        obj['name'] = name;
    }

    /**
     * Constructs a <code>ApiPermissionsGroupPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiPermissionsGroupPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiPermissionsGroupPostRequest} The populated <code>ApiPermissionsGroupPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiPermissionsGroupPostRequest();

            if (data.hasOwnProperty('name')) {
                obj['name'] = ApiClient.convertToType(data['name'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiPermissionsGroupPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiPermissionsGroupPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiPermissionsGroupPostRequest.RequiredProperties) {
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

ApiPermissionsGroupPostRequest.RequiredProperties = ["name"];

/**
 * @member {String} name
 */
ApiPermissionsGroupPostRequest.prototype['name'] = undefined;






export default ApiPermissionsGroupPostRequest;

