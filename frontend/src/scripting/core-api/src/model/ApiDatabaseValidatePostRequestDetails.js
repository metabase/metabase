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
 * The ApiDatabaseValidatePostRequestDetails model module.
 * @module model/ApiDatabaseValidatePostRequestDetails
 * @version v1.53.2-SNAPSHOT
 */
class ApiDatabaseValidatePostRequestDetails {
    /**
     * Constructs a new <code>ApiDatabaseValidatePostRequestDetails</code>.
     * @alias module:model/ApiDatabaseValidatePostRequestDetails
     * @param details {Object} 
     * @param engine {String} 
     */
    constructor(details, engine) { 
        
        ApiDatabaseValidatePostRequestDetails.initialize(this, details, engine);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, details, engine) { 
        obj['details'] = details;
        obj['engine'] = engine;
    }

    /**
     * Constructs a <code>ApiDatabaseValidatePostRequestDetails</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiDatabaseValidatePostRequestDetails} obj Optional instance to populate.
     * @return {module:model/ApiDatabaseValidatePostRequestDetails} The populated <code>ApiDatabaseValidatePostRequestDetails</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiDatabaseValidatePostRequestDetails();

            if (data.hasOwnProperty('details')) {
                obj['details'] = ApiClient.convertToType(data['details'], Object);
            }
            if (data.hasOwnProperty('engine')) {
                obj['engine'] = ApiClient.convertToType(data['engine'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiDatabaseValidatePostRequestDetails</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiDatabaseValidatePostRequestDetails</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiDatabaseValidatePostRequestDetails.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['engine'] && !(typeof data['engine'] === 'string' || data['engine'] instanceof String)) {
            throw new Error("Expected the field `engine` to be a primitive type in the JSON string but got " + data['engine']);
        }

        return true;
    }


}

ApiDatabaseValidatePostRequestDetails.RequiredProperties = ["details", "engine"];

/**
 * @member {Object} details
 */
ApiDatabaseValidatePostRequestDetails.prototype['details'] = undefined;

/**
 * @member {String} engine
 */
ApiDatabaseValidatePostRequestDetails.prototype['engine'] = undefined;






export default ApiDatabaseValidatePostRequestDetails;

