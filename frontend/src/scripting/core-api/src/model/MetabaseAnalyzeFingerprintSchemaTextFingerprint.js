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
 * The MetabaseAnalyzeFingerprintSchemaTextFingerprint model module.
 * @module model/MetabaseAnalyzeFingerprintSchemaTextFingerprint
 * @version v1.53.2-SNAPSHOT
 */
class MetabaseAnalyzeFingerprintSchemaTextFingerprint {
    /**
     * Constructs a new <code>MetabaseAnalyzeFingerprintSchemaTextFingerprint</code>.
     * @alias module:model/MetabaseAnalyzeFingerprintSchemaTextFingerprint
     */
    constructor() { 
        
        MetabaseAnalyzeFingerprintSchemaTextFingerprint.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>MetabaseAnalyzeFingerprintSchemaTextFingerprint</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/MetabaseAnalyzeFingerprintSchemaTextFingerprint} obj Optional instance to populate.
     * @return {module:model/MetabaseAnalyzeFingerprintSchemaTextFingerprint} The populated <code>MetabaseAnalyzeFingerprintSchemaTextFingerprint</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new MetabaseAnalyzeFingerprintSchemaTextFingerprint();

            if (data.hasOwnProperty('average-length')) {
                obj['average-length'] = ApiClient.convertToType(data['average-length'], 'Number');
            }
            if (data.hasOwnProperty('percent-email')) {
                obj['percent-email'] = ApiClient.convertToType(data['percent-email'], 'Number');
            }
            if (data.hasOwnProperty('percent-json')) {
                obj['percent-json'] = ApiClient.convertToType(data['percent-json'], 'Number');
            }
            if (data.hasOwnProperty('percent-state')) {
                obj['percent-state'] = ApiClient.convertToType(data['percent-state'], 'Number');
            }
            if (data.hasOwnProperty('percent-url')) {
                obj['percent-url'] = ApiClient.convertToType(data['percent-url'], 'Number');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>MetabaseAnalyzeFingerprintSchemaTextFingerprint</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>MetabaseAnalyzeFingerprintSchemaTextFingerprint</code>.
     */
    static validateJSON(data) {

        return true;
    }


}



/**
 * @member {Number} average-length
 */
MetabaseAnalyzeFingerprintSchemaTextFingerprint.prototype['average-length'] = undefined;

/**
 * @member {Number} percent-email
 */
MetabaseAnalyzeFingerprintSchemaTextFingerprint.prototype['percent-email'] = undefined;

/**
 * @member {Number} percent-json
 */
MetabaseAnalyzeFingerprintSchemaTextFingerprint.prototype['percent-json'] = undefined;

/**
 * @member {Number} percent-state
 */
MetabaseAnalyzeFingerprintSchemaTextFingerprint.prototype['percent-state'] = undefined;

/**
 * @member {Number} percent-url
 */
MetabaseAnalyzeFingerprintSchemaTextFingerprint.prototype['percent-url'] = undefined;






export default MetabaseAnalyzeFingerprintSchemaTextFingerprint;

