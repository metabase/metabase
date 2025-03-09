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
 * The ApiFieldIdDimensionPostRequest model module.
 * @module model/ApiFieldIdDimensionPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiFieldIdDimensionPostRequest {
    /**
     * Constructs a new <code>ApiFieldIdDimensionPostRequest</code>.
     * @alias module:model/ApiFieldIdDimensionPostRequest
     * @param name {String} 
     * @param type {module:model/ApiFieldIdDimensionPostRequest.TypeEnum} 
     */
    constructor(name, type) { 
        
        ApiFieldIdDimensionPostRequest.initialize(this, name, type);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, name, type) { 
        obj['name'] = name;
        obj['type'] = type;
    }

    /**
     * Constructs a <code>ApiFieldIdDimensionPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiFieldIdDimensionPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiFieldIdDimensionPostRequest} The populated <code>ApiFieldIdDimensionPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiFieldIdDimensionPostRequest();

            if (data.hasOwnProperty('human_readable_field_id')) {
                obj['human_readable_field_id'] = ApiClient.convertToType(data['human_readable_field_id'], 'Number');
            }
            if (data.hasOwnProperty('name')) {
                obj['name'] = ApiClient.convertToType(data['name'], 'String');
            }
            if (data.hasOwnProperty('type')) {
                obj['type'] = ApiClient.convertToType(data['type'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiFieldIdDimensionPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiFieldIdDimensionPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiFieldIdDimensionPostRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['name'] && !(typeof data['name'] === 'string' || data['name'] instanceof String)) {
            throw new Error("Expected the field `name` to be a primitive type in the JSON string but got " + data['name']);
        }
        // ensure the json data is a string
        if (data['type'] && !(typeof data['type'] === 'string' || data['type'] instanceof String)) {
            throw new Error("Expected the field `type` to be a primitive type in the JSON string but got " + data['type']);
        }

        return true;
    }


}

ApiFieldIdDimensionPostRequest.RequiredProperties = ["name", "type"];

/**
 * value must be an integer greater than zero.
 * @member {Number} human_readable_field_id
 */
ApiFieldIdDimensionPostRequest.prototype['human_readable_field_id'] = undefined;

/**
 * @member {String} name
 */
ApiFieldIdDimensionPostRequest.prototype['name'] = undefined;

/**
 * @member {module:model/ApiFieldIdDimensionPostRequest.TypeEnum} type
 */
ApiFieldIdDimensionPostRequest.prototype['type'] = undefined;





/**
 * Allowed values for the <code>type</code> property.
 * @enum {String}
 * @readonly
 */
ApiFieldIdDimensionPostRequest['TypeEnum'] = {

    /**
     * value: "internal"
     * @const
     */
    "internal": "internal",

    /**
     * value: "external"
     * @const
     */
    "external": "external"
};



export default ApiFieldIdDimensionPostRequest;

