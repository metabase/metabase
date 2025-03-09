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
import ApiDashboardIdPutRequestDashcardsInner from './ApiDashboardIdPutRequestDashcardsInner';
import ApiDashboardIdPutRequestTabsInner from './ApiDashboardIdPutRequestTabsInner';

/**
 * The ApiDashboardIdCardsPutRequest model module.
 * @module model/ApiDashboardIdCardsPutRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiDashboardIdCardsPutRequest {
    /**
     * Constructs a new <code>ApiDashboardIdCardsPutRequest</code>.
     * @alias module:model/ApiDashboardIdCardsPutRequest
     * @param cards {Array.<module:model/ApiDashboardIdPutRequestDashcardsInner>} value must be seq of maps in which ids are unique
     */
    constructor(cards) { 
        
        ApiDashboardIdCardsPutRequest.initialize(this, cards);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, cards) { 
        obj['cards'] = cards;
    }

    /**
     * Constructs a <code>ApiDashboardIdCardsPutRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiDashboardIdCardsPutRequest} obj Optional instance to populate.
     * @return {module:model/ApiDashboardIdCardsPutRequest} The populated <code>ApiDashboardIdCardsPutRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiDashboardIdCardsPutRequest();

            if (data.hasOwnProperty('cards')) {
                obj['cards'] = ApiClient.convertToType(data['cards'], [ApiDashboardIdPutRequestDashcardsInner]);
            }
            if (data.hasOwnProperty('tabs')) {
                obj['tabs'] = ApiClient.convertToType(data['tabs'], [ApiDashboardIdPutRequestTabsInner]);
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiDashboardIdCardsPutRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiDashboardIdCardsPutRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiDashboardIdCardsPutRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        if (data['cards']) { // data not null
            // ensure the json data is an array
            if (!Array.isArray(data['cards'])) {
                throw new Error("Expected the field `cards` to be an array in the JSON data but got " + data['cards']);
            }
            // validate the optional field `cards` (array)
            for (const item of data['cards']) {
                ApiDashboardIdPutRequestDashcardsInner.validateJSON(item);
            };
        }
        if (data['tabs']) { // data not null
            // ensure the json data is an array
            if (!Array.isArray(data['tabs'])) {
                throw new Error("Expected the field `tabs` to be an array in the JSON data but got " + data['tabs']);
            }
            // validate the optional field `tabs` (array)
            for (const item of data['tabs']) {
                ApiDashboardIdPutRequestTabsInner.validateJSON(item);
            };
        }

        return true;
    }


}

ApiDashboardIdCardsPutRequest.RequiredProperties = ["cards"];

/**
 * value must be seq of maps in which ids are unique
 * @member {Array.<module:model/ApiDashboardIdPutRequestDashcardsInner>} cards
 */
ApiDashboardIdCardsPutRequest.prototype['cards'] = undefined;

/**
 * value must be seq of maps in which ids are unique
 * @member {Array.<module:model/ApiDashboardIdPutRequestTabsInner>} tabs
 */
ApiDashboardIdCardsPutRequest.prototype['tabs'] = undefined;






export default ApiDashboardIdCardsPutRequest;

