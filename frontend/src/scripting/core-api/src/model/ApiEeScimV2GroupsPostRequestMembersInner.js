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
 * The ApiEeScimV2GroupsPostRequestMembersInner model module.
 * @module model/ApiEeScimV2GroupsPostRequestMembersInner
 * @version v1.53.2-SNAPSHOT
 */
class ApiEeScimV2GroupsPostRequestMembersInner {
    /**
     * Constructs a new <code>ApiEeScimV2GroupsPostRequestMembersInner</code>.
     * @alias module:model/ApiEeScimV2GroupsPostRequestMembersInner
     * @param value {String} 
     */
    constructor(value) { 
        
        ApiEeScimV2GroupsPostRequestMembersInner.initialize(this, value);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, value) { 
        obj['value'] = value;
    }

    /**
     * Constructs a <code>ApiEeScimV2GroupsPostRequestMembersInner</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiEeScimV2GroupsPostRequestMembersInner} obj Optional instance to populate.
     * @return {module:model/ApiEeScimV2GroupsPostRequestMembersInner} The populated <code>ApiEeScimV2GroupsPostRequestMembersInner</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiEeScimV2GroupsPostRequestMembersInner();

            if (data.hasOwnProperty('$ref')) {
                obj['$ref'] = ApiClient.convertToType(data['$ref'], 'String');
            }
            if (data.hasOwnProperty('value')) {
                obj['value'] = ApiClient.convertToType(data['value'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiEeScimV2GroupsPostRequestMembersInner</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiEeScimV2GroupsPostRequestMembersInner</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiEeScimV2GroupsPostRequestMembersInner.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['$ref'] && !(typeof data['$ref'] === 'string' || data['$ref'] instanceof String)) {
            throw new Error("Expected the field `$ref` to be a primitive type in the JSON string but got " + data['$ref']);
        }
        // ensure the json data is a string
        if (data['value'] && !(typeof data['value'] === 'string' || data['value'] instanceof String)) {
            throw new Error("Expected the field `value` to be a primitive type in the JSON string but got " + data['value']);
        }

        return true;
    }


}

ApiEeScimV2GroupsPostRequestMembersInner.RequiredProperties = ["value"];

/**
 * @member {String} $ref
 */
ApiEeScimV2GroupsPostRequestMembersInner.prototype['$ref'] = undefined;

/**
 * @member {String} value
 */
ApiEeScimV2GroupsPostRequestMembersInner.prototype['value'] = undefined;






export default ApiEeScimV2GroupsPostRequestMembersInner;

