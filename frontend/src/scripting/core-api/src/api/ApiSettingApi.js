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


import ApiClient from "../ApiClient";

/**
* ApiSetting service.
* @module api/ApiSettingApi
* @version v1.53.2-SNAPSHOT
*/
export default class ApiSettingApi {

    /**
    * Constructs a new ApiSettingApi. 
    * @alias module:api/ApiSettingApi
    * @class
    * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
    * default to {@link module:ApiClient#instance} if unspecified.
    */
    constructor(apiClient) {
        this.apiClient = apiClient || ApiClient.instance;
    }


    /**
     * Callback function to receive the result of the apiSettingGet operation.
     * @callback module:api/ApiSettingApi~apiSettingGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/setting/
     * Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.   For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint.
     * @param {module:api/ApiSettingApi~apiSettingGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSettingGet(callback) {
      let postBody = null;

      let pathParams = {
      };
      let queryParams = {
      };
      let headerParams = {
      };
      let formParams = {
      };

      let authNames = [];
      let contentTypes = [];
      let accepts = [];
      let returnType = null;
      return this.apiClient.callApi(
        '/api/setting/', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSettingKeyGet operation.
     * @callback module:api/ApiSettingApi~apiSettingKeyGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/setting/{key}
     * Fetch a single `Setting`.
     * @param {String} key 
     * @param {module:api/ApiSettingApi~apiSettingKeyGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSettingKeyGet(key, callback) {
      let postBody = null;
      // verify the required parameter 'key' is set
      if (key === undefined || key === null) {
        throw new Error("Missing the required parameter 'key' when calling apiSettingKeyGet");
      }

      let pathParams = {
        'key': key
      };
      let queryParams = {
      };
      let headerParams = {
      };
      let formParams = {
      };

      let authNames = [];
      let contentTypes = [];
      let accepts = [];
      let returnType = null;
      return this.apiClient.callApi(
        '/api/setting/{key}', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSettingKeyPut operation.
     * @callback module:api/ApiSettingApi~apiSettingKeyPutCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PUT /api/setting/{key}
     * Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.    This endpoint can also be used to delete Settings by passing `nil` for `:value`.
     * @param {String} key 
     * @param {module:api/ApiSettingApi~apiSettingKeyPutCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSettingKeyPut(key, callback) {
      let postBody = null;
      // verify the required parameter 'key' is set
      if (key === undefined || key === null) {
        throw new Error("Missing the required parameter 'key' when calling apiSettingKeyPut");
      }

      let pathParams = {
        'key': key
      };
      let queryParams = {
      };
      let headerParams = {
      };
      let formParams = {
      };

      let authNames = [];
      let contentTypes = [];
      let accepts = [];
      let returnType = null;
      return this.apiClient.callApi(
        '/api/setting/{key}', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSettingPut operation.
     * @callback module:api/ApiSettingApi~apiSettingPutCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PUT /api/setting/
     * Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated.
     * @param {Object} opts Optional parameters
     * @param {Object.<String, {String: Object}>} [requestBody] 
     * @param {module:api/ApiSettingApi~apiSettingPutCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSettingPut(opts, callback) {
      opts = opts || {};
      let postBody = opts['requestBody'];

      let pathParams = {
      };
      let queryParams = {
      };
      let headerParams = {
      };
      let formParams = {
      };

      let authNames = [];
      let contentTypes = ['application/json'];
      let accepts = [];
      let returnType = null;
      return this.apiClient.callApi(
        '/api/setting/', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }


}
