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
 * The MetabaseApiCache1cacheStrategyEeDuration model module.
 * @module model/MetabaseApiCache1cacheStrategyEeDuration
 * @version v1.53.2-SNAPSHOT
 */
class MetabaseApiCache1cacheStrategyEeDuration {
    /**
     * Constructs a new <code>MetabaseApiCache1cacheStrategyEeDuration</code>.
     * @alias module:model/MetabaseApiCache1cacheStrategyEeDuration
     * @param duration {Number} value must be an integer greater than zero.
     * @param type {Object} 
     * @param unit {module:model/MetabaseApiCache1cacheStrategyEeDuration.UnitEnum} 
     */
    constructor(duration, type, unit) { 
        
        MetabaseApiCache1cacheStrategyEeDuration.initialize(this, duration, type, unit);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, duration, type, unit) { 
        obj['duration'] = duration;
        obj['type'] = type;
        obj['unit'] = unit;
    }

    /**
     * Constructs a <code>MetabaseApiCache1cacheStrategyEeDuration</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/MetabaseApiCache1cacheStrategyEeDuration} obj Optional instance to populate.
     * @return {module:model/MetabaseApiCache1cacheStrategyEeDuration} The populated <code>MetabaseApiCache1cacheStrategyEeDuration</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new MetabaseApiCache1cacheStrategyEeDuration();

            if (data.hasOwnProperty('duration')) {
                obj['duration'] = ApiClient.convertToType(data['duration'], 'Number');
            }
            if (data.hasOwnProperty('refresh_automatically')) {
                obj['refresh_automatically'] = ApiClient.convertToType(data['refresh_automatically'], 'Boolean');
            }
            if (data.hasOwnProperty('type')) {
                obj['type'] = ApiClient.convertToType(data['type'], Object);
            }
            if (data.hasOwnProperty('unit')) {
                obj['unit'] = ApiClient.convertToType(data['unit'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>MetabaseApiCache1cacheStrategyEeDuration</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>MetabaseApiCache1cacheStrategyEeDuration</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of MetabaseApiCache1cacheStrategyEeDuration.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['unit'] && !(typeof data['unit'] === 'string' || data['unit'] instanceof String)) {
            throw new Error("Expected the field `unit` to be a primitive type in the JSON string but got " + data['unit']);
        }

        return true;
    }


}

MetabaseApiCache1cacheStrategyEeDuration.RequiredProperties = ["duration", "type", "unit"];

/**
 * value must be an integer greater than zero.
 * @member {Number} duration
 */
MetabaseApiCache1cacheStrategyEeDuration.prototype['duration'] = undefined;

/**
 * @member {Boolean} refresh_automatically
 */
MetabaseApiCache1cacheStrategyEeDuration.prototype['refresh_automatically'] = undefined;

/**
 * @member {Object} type
 */
MetabaseApiCache1cacheStrategyEeDuration.prototype['type'] = undefined;

/**
 * @member {module:model/MetabaseApiCache1cacheStrategyEeDuration.UnitEnum} unit
 */
MetabaseApiCache1cacheStrategyEeDuration.prototype['unit'] = undefined;





/**
 * Allowed values for the <code>unit</code> property.
 * @enum {String}
 * @readonly
 */
MetabaseApiCache1cacheStrategyEeDuration['UnitEnum'] = {

    /**
     * value: "hours"
     * @const
     */
    "hours": "hours",

    /**
     * value: "minutes"
     * @const
     */
    "minutes": "minutes",

    /**
     * value: "seconds"
     * @const
     */
    "seconds": "seconds",

    /**
     * value: "days"
     * @const
     */
    "days": "days"
};



export default MetabaseApiCache1cacheStrategyEeDuration;

