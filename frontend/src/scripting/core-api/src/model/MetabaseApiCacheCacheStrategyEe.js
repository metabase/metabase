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
import MetabaseApiCacheCacheStrategyBase from './MetabaseApiCacheCacheStrategyBase';

/**
 * The MetabaseApiCacheCacheStrategyEe model module.
 * @module model/MetabaseApiCacheCacheStrategyEe
 * @version v1.53.2-SNAPSHOT
 */
class MetabaseApiCacheCacheStrategyEe {
    /**
     * Constructs a new <code>MetabaseApiCacheCacheStrategyEe</code>.
     * Schema for a caching strategy in EE when we have an premium token with &#x60;:cache-granular-controls&#x60;.
     * @alias module:model/MetabaseApiCacheCacheStrategyEe
     * @implements module:model/MetabaseApiCacheCacheStrategyBase
     * @param type {Object} 
     * @param minDurationMs {Number} value must be an integer greater or equal to than zero.
     * @param multiplier {Number} value must be an integer greater than zero.
     * @param duration {Number} value must be an integer greater than zero.
     * @param unit {module:model/MetabaseApiCacheCacheStrategyEe.UnitEnum} 
     * @param schedule {String} 
     */
    constructor(type, minDurationMs, multiplier, duration, unit, schedule) { 
        MetabaseApiCacheCacheStrategyBase.initialize(this, type);
        MetabaseApiCacheCacheStrategyEe.initialize(this, type, minDurationMs, multiplier, duration, unit, schedule);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, type, minDurationMs, multiplier, duration, unit, schedule) { 
        obj['type'] = type;
        obj['min_duration_ms'] = minDurationMs;
        obj['multiplier'] = multiplier;
        obj['duration'] = duration;
        obj['unit'] = unit;
        obj['schedule'] = schedule;
    }

    /**
     * Constructs a <code>MetabaseApiCacheCacheStrategyEe</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/MetabaseApiCacheCacheStrategyEe} obj Optional instance to populate.
     * @return {module:model/MetabaseApiCacheCacheStrategyEe} The populated <code>MetabaseApiCacheCacheStrategyEe</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new MetabaseApiCacheCacheStrategyEe();
            MetabaseApiCacheCacheStrategyBase.constructFromObject(data, obj);

            if (data.hasOwnProperty('type')) {
                obj['type'] = ApiClient.convertToType(data['type'], Object);
            }
            if (data.hasOwnProperty('min_duration_ms')) {
                obj['min_duration_ms'] = ApiClient.convertToType(data['min_duration_ms'], 'Number');
            }
            if (data.hasOwnProperty('multiplier')) {
                obj['multiplier'] = ApiClient.convertToType(data['multiplier'], 'Number');
            }
            if (data.hasOwnProperty('duration')) {
                obj['duration'] = ApiClient.convertToType(data['duration'], 'Number');
            }
            if (data.hasOwnProperty('refresh_automatically')) {
                obj['refresh_automatically'] = ApiClient.convertToType(data['refresh_automatically'], 'Boolean');
            }
            if (data.hasOwnProperty('unit')) {
                obj['unit'] = ApiClient.convertToType(data['unit'], 'String');
            }
            if (data.hasOwnProperty('schedule')) {
                obj['schedule'] = ApiClient.convertToType(data['schedule'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>MetabaseApiCacheCacheStrategyEe</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>MetabaseApiCacheCacheStrategyEe</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of MetabaseApiCacheCacheStrategyEe.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is a string
        if (data['unit'] && !(typeof data['unit'] === 'string' || data['unit'] instanceof String)) {
            throw new Error("Expected the field `unit` to be a primitive type in the JSON string but got " + data['unit']);
        }
        // ensure the json data is a string
        if (data['schedule'] && !(typeof data['schedule'] === 'string' || data['schedule'] instanceof String)) {
            throw new Error("Expected the field `schedule` to be a primitive type in the JSON string but got " + data['schedule']);
        }

        return true;
    }


}

MetabaseApiCacheCacheStrategyEe.RequiredProperties = ["type", "min_duration_ms", "multiplier", "duration", "unit", "schedule"];

/**
 * @member {Object} type
 */
MetabaseApiCacheCacheStrategyEe.prototype['type'] = undefined;

/**
 * value must be an integer greater or equal to than zero.
 * @member {Number} min_duration_ms
 */
MetabaseApiCacheCacheStrategyEe.prototype['min_duration_ms'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} multiplier
 */
MetabaseApiCacheCacheStrategyEe.prototype['multiplier'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} duration
 */
MetabaseApiCacheCacheStrategyEe.prototype['duration'] = undefined;

/**
 * @member {Boolean} refresh_automatically
 */
MetabaseApiCacheCacheStrategyEe.prototype['refresh_automatically'] = undefined;

/**
 * @member {module:model/MetabaseApiCacheCacheStrategyEe.UnitEnum} unit
 */
MetabaseApiCacheCacheStrategyEe.prototype['unit'] = undefined;

/**
 * @member {String} schedule
 */
MetabaseApiCacheCacheStrategyEe.prototype['schedule'] = undefined;


// Implement MetabaseApiCacheCacheStrategyBase interface:
/**
 * @member {module:model/MetabaseApiCacheCacheStrategyBase.TypeEnum} type
 */
MetabaseApiCacheCacheStrategyBase.prototype['type'] = undefined;



/**
 * Allowed values for the <code>unit</code> property.
 * @enum {String}
 * @readonly
 */
MetabaseApiCacheCacheStrategyEe['UnitEnum'] = {

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



export default MetabaseApiCacheCacheStrategyEe;

