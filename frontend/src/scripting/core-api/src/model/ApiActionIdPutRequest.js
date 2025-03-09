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
import ApiActionIdPutRequestTemplate from './ApiActionIdPutRequestTemplate';

/**
 * The ApiActionIdPutRequest model module.
 * @module model/ApiActionIdPutRequest
 * @version v1.53.2-SNAPSHOT
 */
class ApiActionIdPutRequest {
    /**
     * Constructs a new <code>ApiActionIdPutRequest</code>.
     * @alias module:model/ApiActionIdPutRequest
     */
    constructor() { 
        
        ApiActionIdPutRequest.initialize(this);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj) { 
    }

    /**
     * Constructs a <code>ApiActionIdPutRequest</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/ApiActionIdPutRequest} obj Optional instance to populate.
     * @return {module:model/ApiActionIdPutRequest} The populated <code>ApiActionIdPutRequest</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new ApiActionIdPutRequest();

            if (data.hasOwnProperty('visualization_settings')) {
                obj['visualization_settings'] = ApiClient.convertToType(data['visualization_settings'], Object);
            }
            if (data.hasOwnProperty('response_handle')) {
                obj['response_handle'] = ApiClient.convertToType(data['response_handle'], 'String');
            }
            if (data.hasOwnProperty('dataset_query')) {
                obj['dataset_query'] = ApiClient.convertToType(data['dataset_query'], Object);
            }
            if (data.hasOwnProperty('parameter_mappings')) {
                obj['parameter_mappings'] = ApiClient.convertToType(data['parameter_mappings'], Object);
            }
            if (data.hasOwnProperty('name')) {
                obj['name'] = ApiClient.convertToType(data['name'], 'String');
            }
            if (data.hasOwnProperty('archived')) {
                obj['archived'] = ApiClient.convertToType(data['archived'], 'Boolean');
            }
            if (data.hasOwnProperty('database_id')) {
                obj['database_id'] = ApiClient.convertToType(data['database_id'], 'Number');
            }
            if (data.hasOwnProperty('kind')) {
                obj['kind'] = ApiClient.convertToType(data['kind'], 'String');
            }
            if (data.hasOwnProperty('type')) {
                obj['type'] = ApiClient.convertToType(data['type'], 'String');
            }
            if (data.hasOwnProperty('template')) {
                obj['template'] = ApiActionIdPutRequestTemplate.constructFromObject(data['template']);
            }
            if (data.hasOwnProperty('error_handle')) {
                obj['error_handle'] = ApiClient.convertToType(data['error_handle'], 'String');
            }
            if (data.hasOwnProperty('model_id')) {
                obj['model_id'] = ApiClient.convertToType(data['model_id'], 'Number');
            }
            if (data.hasOwnProperty('parameters')) {
                obj['parameters'] = ApiClient.convertToType(data['parameters'], [Object]);
            }
            if (data.hasOwnProperty('description')) {
                obj['description'] = ApiClient.convertToType(data['description'], 'String');
            }
        }
        return obj;
    }

    /**
     * Validates the JSON data with respect to <code>ApiActionIdPutRequest</code>.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @return {boolean} to indicate whether the JSON data is valid with respect to <code>ApiActionIdPutRequest</code>.
     */
    static validateJSON(data) {
        // validate the optional field `response_handle`
        if (data['response_handle']) { // data not null
          String.validateJSON(data['response_handle']);
        }
        // ensure the json data is a string
        if (data['name'] && !(typeof data['name'] === 'string' || data['name'] instanceof String)) {
            throw new Error("Expected the field `name` to be a primitive type in the JSON string but got " + data['name']);
        }
        // ensure the json data is a string
        if (data['kind'] && !(typeof data['kind'] === 'string' || data['kind'] instanceof String)) {
            throw new Error("Expected the field `kind` to be a primitive type in the JSON string but got " + data['kind']);
        }
        // ensure the json data is a string
        if (data['type'] && !(typeof data['type'] === 'string' || data['type'] instanceof String)) {
            throw new Error("Expected the field `type` to be a primitive type in the JSON string but got " + data['type']);
        }
        // validate the optional field `template`
        if (data['template']) { // data not null
          ApiActionIdPutRequestTemplate.validateJSON(data['template']);
        }
        // validate the optional field `error_handle`
        if (data['error_handle']) { // data not null
          String.validateJSON(data['error_handle']);
        }
        // ensure the json data is an array
        if (!Array.isArray(data['parameters'])) {
            throw new Error("Expected the field `parameters` to be an array in the JSON data but got " + data['parameters']);
        }
        // ensure the json data is a string
        if (data['description'] && !(typeof data['description'] === 'string' || data['description'] instanceof String)) {
            throw new Error("Expected the field `description` to be a primitive type in the JSON string but got " + data['description']);
        }

        return true;
    }


}



/**
 * @member {Object} visualization_settings
 */
ApiActionIdPutRequest.prototype['visualization_settings'] = undefined;

/**
 * @member {String} response_handle
 */
ApiActionIdPutRequest.prototype['response_handle'] = undefined;

/**
 * @member {Object} dataset_query
 */
ApiActionIdPutRequest.prototype['dataset_query'] = undefined;

/**
 * @member {Object} parameter_mappings
 */
ApiActionIdPutRequest.prototype['parameter_mappings'] = undefined;

/**
 * @member {String} name
 */
ApiActionIdPutRequest.prototype['name'] = undefined;

/**
 * @member {Boolean} archived
 */
ApiActionIdPutRequest.prototype['archived'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} database_id
 */
ApiActionIdPutRequest.prototype['database_id'] = undefined;

/**
 * Unsupported implicit action kind
 * @member {module:model/ApiActionIdPutRequest.KindEnum} kind
 */
ApiActionIdPutRequest.prototype['kind'] = undefined;

/**
 * Unsupported action type
 * @member {module:model/ApiActionIdPutRequest.TypeEnum} type
 */
ApiActionIdPutRequest.prototype['type'] = undefined;

/**
 * @member {module:model/ApiActionIdPutRequestTemplate} template
 */
ApiActionIdPutRequest.prototype['template'] = undefined;

/**
 * @member {String} error_handle
 */
ApiActionIdPutRequest.prototype['error_handle'] = undefined;

/**
 * value must be an integer greater than zero.
 * @member {Number} model_id
 */
ApiActionIdPutRequest.prototype['model_id'] = undefined;

/**
 * @member {Array.<Object>} parameters
 */
ApiActionIdPutRequest.prototype['parameters'] = undefined;

/**
 * @member {String} description
 */
ApiActionIdPutRequest.prototype['description'] = undefined;





/**
 * Allowed values for the <code>kind</code> property.
 * @enum {String}
 * @readonly
 */
ApiActionIdPutRequest['KindEnum'] = {

    /**
     * value: "row/create"
     * @const
     */
    "row/create": "row/create",

    /**
     * value: "row/update"
     * @const
     */
    "row/update": "row/update",

    /**
     * value: "row/delete"
     * @const
     */
    "row/delete": "row/delete",

    /**
     * value: "bulk/create"
     * @const
     */
    "bulk/create": "bulk/create",

    /**
     * value: "bulk/update"
     * @const
     */
    "bulk/update": "bulk/update",

    /**
     * value: "bulk/delete"
     * @const
     */
    "bulk/delete": "bulk/delete"
};


/**
 * Allowed values for the <code>type</code> property.
 * @enum {String}
 * @readonly
 */
ApiActionIdPutRequest['TypeEnum'] = {

    /**
     * value: "http"
     * @const
     */
    "http": "http",

    /**
     * value: "query"
     * @const
     */
    "query": "query",

    /**
     * value: "implicit"
     * @const
     */
    "implicit": "implicit"
};



export default ApiActionIdPutRequest;

