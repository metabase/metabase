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
import ApiEeScimV2UsersPostRequestEmailsInner from './ApiEeScimV2UsersPostRequestEmailsInner';
import ApiEeScimV2UsersPostRequestGroupsInner from './ApiEeScimV2UsersPostRequestGroupsInner';
import ApiEeScimV2UsersPostRequestName from './ApiEeScimV2UsersPostRequestName';

/**
 * The ApiEeScimV2UsersPostRequest model module.
 * @module model/ApiEeScimV2UsersPostRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiEeScimV2UsersPostRequest {
    /**
     * Constructs a new <code>ApiEeScimV2UsersPostRequest</code>.
     * @alias module:model/ApiEeScimV2UsersPostRequest
     * @param emails {Array.<module:model/ApiEeScimV2UsersPostRequestEmailsInner>} 
     * @param name {module:model/ApiEeScimV2UsersPostRequestName} 
     * @param schemas {Array.<String>} 
     * @param userName {String} 
     */
    constructor(emails, name, schemas, userName) { 
        
        ApiEeScimV2UsersPostRequest.initialize(this, emails, name, schemas, userName);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, emails, name, schemas, userName) { 
        obj['emails'] = emails;
        obj['name'] = name;
        obj['schemas'] = schemas;
        obj['userName'] = userName;
    }

    /**
     * Constructs a <code>ApiEeScimV2UsersPostRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiEeScimV2UsersPostRequest} obj Optional instance to populate.
     * @return {module:model/ApiEeScimV2UsersPostRequest} The populated <code>ApiEeScimV2UsersPostRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiEeScimV2UsersPostRequest();

            if (data.hasOwnProperty('active')) {
                obj['active'] = ApiClient.convertToType(data['active'], 'Boolean');
            }
            if (data.hasOwnProperty('emails')) {
                obj['emails'] = ApiClient.convertToType(data['emails'], [ApiEeScimV2UsersPostRequestEmailsInner]);
            }
            if (data.hasOwnProperty('groups')) {
                obj['groups'] = ApiClient.convertToType(data['groups'], [ApiEeScimV2UsersPostRequestGroupsInner]);
            }
            if (data.hasOwnProperty('id')) {
                obj['id'] = ApiClient.convertToType(data['id'], 'String');
            }
            if (data.hasOwnProperty('locale')) {
                obj['locale'] = ApiClient.convertToType(data['locale'], 'String');
            }
            if (data.hasOwnProperty('name')) {
                obj['name'] = ApiEeScimV2UsersPostRequestName.constructFromObject(data['name']);
            }
            if (data.hasOwnProperty('schemas')) {
                obj['schemas'] = ApiClient.convertToType(data['schemas'], ['String']);
            }
            if (data.hasOwnProperty('userName')) {
                obj['userName'] = ApiClient.convertToType(data['userName'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiEeScimV2UsersPostRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiEeScimV2UsersPostRequest</code>.
     */
    static validateJSON(data) {
        // check to make sure all required properties are present in the JSON string
        for (const property of ApiEeScimV2UsersPostRequest.RequiredProperties) {
            if (!data.hasOwnProperty(property)) {
                throw new Error("The required field `" + property + "` is not found in the JSON data: " + JSON.stringify(data));
            }
        }
        if (data['emails']) { // data not null
            // ensure the json data is an array
            if (!Array.isArray(data['emails'])) {
                throw new Error("Expected the field `emails` to be an array in the JSON data but got " + data['emails']);
            }
            // validate the optional field `emails` (array)
            for (const item of data['emails']) {
                ApiEeScimV2UsersPostRequestEmailsInner.validateJSON(item);
            };
        }
        if (data['groups']) { // data not null
            // ensure the json data is an array
            if (!Array.isArray(data['groups'])) {
                throw new Error("Expected the field `groups` to be an array in the JSON data but got " + data['groups']);
            }
            // validate the optional field `groups` (array)
            for (const item of data['groups']) {
                ApiEeScimV2UsersPostRequestGroupsInner.validateJSON(item);
            };
        }
        // ensure the json data is a string
        if (data['id'] && !(typeof data['id'] === 'string' || data['id'] instanceof String)) {
            throw new Error("Expected the field `id` to be a primitive type in the JSON string but got " + data['id']);
        }
        // ensure the json data is a string
        if (data['locale'] && !(typeof data['locale'] === 'string' || data['locale'] instanceof String)) {
            throw new Error("Expected the field `locale` to be a primitive type in the JSON string but got " + data['locale']);
        }
        // validate the optional field `name`
        if (data['name']) { // data not null
          ApiEeScimV2UsersPostRequestName.validateJSON(data['name']);
        }
        // ensure the json data is an array
        if (!Array.isArray(data['schemas'])) {
            throw new Error("Expected the field `schemas` to be an array in the JSON data but got " + data['schemas']);
        }
        // ensure the json data is a string
        if (data['userName'] && !(typeof data['userName'] === 'string' || data['userName'] instanceof String)) {
            throw new Error("Expected the field `userName` to be a primitive type in the JSON string but got " + data['userName']);
        }

        return true;
    }


}

ApiEeScimV2UsersPostRequest.RequiredProperties = ["emails", "name", "schemas", "userName"];

/**
 * @member {Boolean} active
 */
ApiEeScimV2UsersPostRequest.prototype['active'] = undefined;

/**
 * @member {Array.<module:model/ApiEeScimV2UsersPostRequestEmailsInner>} emails
 */
ApiEeScimV2UsersPostRequest.prototype['emails'] = undefined;

/**
 * @member {Array.<module:model/ApiEeScimV2UsersPostRequestGroupsInner>} groups
 */
ApiEeScimV2UsersPostRequest.prototype['groups'] = undefined;

/**
 * @member {String} id
 */
ApiEeScimV2UsersPostRequest.prototype['id'] = undefined;

/**
 * @member {String} locale
 */
ApiEeScimV2UsersPostRequest.prototype['locale'] = undefined;

/**
 * @member {module:model/ApiEeScimV2UsersPostRequestName} name
 */
ApiEeScimV2UsersPostRequest.prototype['name'] = undefined;

/**
 * @member {Array.<String>} schemas
 */
ApiEeScimV2UsersPostRequest.prototype['schemas'] = undefined;

/**
 * @member {String} userName
 */
ApiEeScimV2UsersPostRequest.prototype['userName'] = undefined;






export default ApiEeScimV2UsersPostRequest;

