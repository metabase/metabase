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
 * The MetabaseAnalyzeFingerprintSchema1NumberFingerprint model module.
 * @module model/MetabaseAnalyzeFingerprintSchema1NumberFingerprint
 * @version v1.53.2-SNAPSHOT
 */
class MetabaseAnalyzeFingerprintSchema1NumberFingerprint {
    /**
     * Constructs a new <code>MetabaseAnalyzeFingerprintSchema1NumberFingerprint</code>.
     * @alias module:model/MetabaseAnalyzeFingerprintSchema1NumberFingerprint
     */
    constructor() { 
        
        MetabaseAnalyzeFingerprintSchema1NumberFingerprint.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>MetabaseAnalyzeFingerprintSchema1NumberFingerprint</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/MetabaseAnalyzeFingerprintSchema1NumberFingerprint} obj Optional instance to populate.
     * @return {module:model/MetabaseAnalyzeFingerprintSchema1NumberFingerprint} The populated <code>MetabaseAnalyzeFingerprintSchema1NumberFingerprint</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new MetabaseAnalyzeFingerprintSchema1NumberFingerprint();

            if (data.hasOwnProperty('avg')) {
                obj['avg'] = ApiClient.convertToType(data['avg'], 'Number');
            }
            if (data.hasOwnProperty('max')) {
                obj['max'] = ApiClient.convertToType(data['max'], 'Number');
            }
            if (data.hasOwnProperty('min')) {
                obj['min'] = ApiClient.convertToType(data['min'], 'Number');
            }
            if (data.hasOwnProperty('q1')) {
                obj['q1'] = ApiClient.convertToType(data['q1'], 'Number');
            }
            if (data.hasOwnProperty('q3')) {
                obj['q3'] = ApiClient.convertToType(data['q3'], 'Number');
            }
            if (data.hasOwnProperty('sd')) {
                obj['sd'] = ApiClient.convertToType(data['sd'], 'Number');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>MetabaseAnalyzeFingerprintSchema1NumberFingerprint</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>MetabaseAnalyzeFingerprintSchema1NumberFingerprint</code>.
     */
    static validateJSON(data) {

        return true;
    }


}



/**
 * @member {Number} avg
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['avg'] = undefined;

/**
 * @member {Number} max
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['max'] = undefined;

/**
 * @member {Number} min
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['min'] = undefined;

/**
 * @member {Number} q1
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['q1'] = undefined;

/**
 * @member {Number} q3
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['q3'] = undefined;

/**
 * @member {Number} sd
 */
MetabaseAnalyzeFingerprintSchema1NumberFingerprint.prototype['sd'] = undefined;






export default MetabaseAnalyzeFingerprintSchema1NumberFingerprint;

