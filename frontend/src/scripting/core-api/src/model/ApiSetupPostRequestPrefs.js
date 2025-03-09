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
 * The ApiSetupPostRequestPrefs model module.
 * @module model/ApiSetupPostRequestPrefs
 * @version v1.53.2-SNAPSHOT
 */
class ApiSetupPostRequestPrefs {
    /**
     * Constructs a new <code>ApiSetupPostRequestPrefs</code>.
     * @alias module:model/ApiSetupPostRequestPrefs
     * @param siteName {String} 
     */
    constructor(siteName) { 
        
        ApiSetupPostRequestPrefs.initialize(this, siteName);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, siteName) { 
        obj['site_name'] = siteName;
    }

    /**
     * Constructs a <code>ApiSetupPostRequestPrefs</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiSetupPostRequestPrefs} obj Optional instance to populate.
     * @return {module:model/ApiSetupPostRequestPrefs} The populated <code>ApiSetupPostRequestPrefs</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiSetupPostRequestPrefs();

            if (data.hasOwnProperty('site_locale')) {
                obj['site_locale'] = ApiClient.convertToType(data['site_locale'], 'String');
            }
            if (data.hasOwnProperty('site_name')) {
                obj['site_name'] = ApiClient.convertToType(data['site_name'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiSetupPostRequestPrefs</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiSetupPostRequestPrefs</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiSetupPostRequestPrefs.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['site_locale'] && !(typeof data['site_locale'] === 'string' || data['site_locale'] instanceof String)) {
            throw new Error("Expected the field `site_locale` to be a primitive type in the JSON string but got " + data['site_locale']);
        }
        // ensure the json data is a string
        if (data['site_name'] && !(typeof data['site_name'] === 'string' || data['site_name'] instanceof String)) {
            throw new Error("Expected the field `site_name` to be a primitive type in the JSON string but got " + data['site_name']);
        }

        return true;
    }


}

ApiSetupPostRequestPrefs.RequiredProperties = ["site_name"];

/**
 * @member {String} site_locale
 */
ApiSetupPostRequestPrefs.prototype['site_locale'] = undefined;

/**
 * @member {String} site_name
 */
ApiSetupPostRequestPrefs.prototype['site_name'] = undefined;






export default ApiSetupPostRequestPrefs;

