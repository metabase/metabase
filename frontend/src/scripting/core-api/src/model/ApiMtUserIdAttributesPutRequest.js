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
 * The ApiMtUserIdAttributesPutRequest model module.
 * @module model/ApiMtUserIdAttributesPutRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiMtUserIdAttributesPutRequest {
    /**
     * Constructs a new <code>ApiMtUserIdAttributesPutRequest</code>.
     * @alias module:model/ApiMtUserIdAttributesPutRequest
     */
    constructor() { 
        
        ApiMtUserIdAttributesPutRequest.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>ApiMtUserIdAttributesPutRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiMtUserIdAttributesPutRequest} obj Optional instance to populate.
     * @return {module:model/ApiMtUserIdAttributesPutRequest} The populated <code>ApiMtUserIdAttributesPutRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiMtUserIdAttributesPutRequest();

            if (data.hasOwnProperty('login_attributes')) {
                obj['login_attributes'] = ApiClient.convertToType(data['login_attributes'], {'String': Object});
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiMtUserIdAttributesPutRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiMtUserIdAttributesPutRequest</code>.
     */
    static validateJSON(data) {

        return true;
    }


}



/**
 * value must be a valid user attributes map (name -> value)
 * @member {Object.<String, Object>} login_attributes
 */
ApiMtUserIdAttributesPutRequest.prototype['login_attributes'] = undefined;






export default ApiMtUserIdAttributesPutRequest;

