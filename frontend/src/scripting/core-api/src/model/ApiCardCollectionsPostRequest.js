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
 * The ApiCardCollectionsPostRequest model module.
 * @module model/ApiCardCollectionsPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiCardCollectionsPostRequest {
    /**
     * Constructs a new <code>ApiCardCollectionsPostRequest</code>.
     * @alias module:model/ApiCardCollectionsPostRequest
     * @param cardIds {Array.<Number>} 
     */
    constructor(cardIds) { 
        
        ApiCardCollectionsPostRequest.initialize(this, cardIds);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, cardIds) { 
        obj['card_ids'] = cardIds;
    }

    /**
     * Constructs a <code>ApiCardCollectionsPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiCardCollectionsPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiCardCollectionsPostRequest} The populated <code>ApiCardCollectionsPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiCardCollectionsPostRequest();

            if (data.hasOwnProperty('card_ids')) {
                obj['card_ids'] = ApiClient.convertToType(data['card_ids'], ['Number']);
            }
            if (data.hasOwnProperty('collection_id')) {
                obj['collection_id'] = ApiClient.convertToType(data['collection_id'], 'Number');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiCardCollectionsPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiCardCollectionsPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiCardCollectionsPostRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        // ensure the json data is an array
        if (!Array.isArray(data['card_ids'])) {
            throw new Error("Expected the field `card_ids` to be an array in the JSON data but got " + data['card_ids']);
        }

        return true;
    }


}

ApiCardCollectionsPostRequest.RequiredProperties = ["card_ids"];

/**
 * @member {Array.<Number>} card_ids
 */
ApiCardCollectionsPostRequest.prototype['card_ids'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} collection_id
 */
ApiCardCollectionsPostRequest.prototype['collection_id'] = undefined;






export default ApiCardCollectionsPostRequest;

