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
import ApiEeScimV2GroupsPostRequest from '../model/ApiEeScimV2GroupsPostRequest';
import ApiEeScimV2UsersIdPatchRequest from '../model/ApiEeScimV2UsersIdPatchRequest';
import ApiEeScimV2UsersPostRequest from '../model/ApiEeScimV2UsersPostRequest';

/**
* ApiEeScimV2 service.
* @module api/ApiEeScimV2Api
* @version v1.53.2-SNAPSHOT
*/
export default class ApiEeScimV2Api {

    /**
    * Constructs a new ApiEeScimV2Api. 
    * @alias module:api/ApiEeScimV2Api
    * @class
    * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
    * default to {@link module:ApiClient#instance} if unspecified.
    */
    constructor(apiClient) {
        this.apiClient = apiClient || ApiClient.instance;
    }


    /**
     * Callback function to receive the result of the apiEeScimV2GroupsGet operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2GroupsGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/ee/scim/v2/Groups
     * Fetch a list of groups.
     * @param {Object} opts Optional parameters
     * @param {Number} [startIndex] value must be an integer greater than zero.
     * @param {Number} [count] value must be an integer greater than zero.
     * @param {String} [filter] value must be a non-blank string.
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2GroupsGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2GroupsGet(opts, callback) {
      opts = opts || {};
      let postBody = null;

      let pathParams = {
      };
      let queryParams = {
        'startIndex': opts['startIndex'],
        'count': opts['count'],
        'filter': opts['filter']
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
        '/api/ee/scim/v2/Groups', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2GroupsIdDelete operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdDeleteCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * DELETE /api/ee/scim/v2/Groups/{id}
     * Delete a group.
     * @param {String} id value must be a non-blank string.
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdDeleteCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2GroupsIdDelete(id, callback) {
      let postBody = null;
      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling apiEeScimV2GroupsIdDelete");
      }

      let pathParams = {
        'id': id
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
        '/api/ee/scim/v2/Groups/{id}', 'DELETE',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2GroupsIdGet operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/ee/scim/v2/Groups/{id}
     * Fetch a single group.
     * @param {String} id value must be a non-blank string.
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2GroupsIdGet(id, callback) {
      let postBody = null;
      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling apiEeScimV2GroupsIdGet");
      }

      let pathParams = {
        'id': id
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
        '/api/ee/scim/v2/Groups/{id}', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2GroupsIdPut operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdPutCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PUT /api/ee/scim/v2/Groups/{id}
     * Update a group.
     * @param {Object} opts Optional parameters
     * @param {module:model/ApiEeScimV2GroupsPostRequest} [apiEeScimV2GroupsPostRequest] 
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2GroupsIdPutCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2GroupsIdPut(opts, callback) {
      opts = opts || {};
      let postBody = opts['apiEeScimV2GroupsPostRequest'];

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
        '/api/ee/scim/v2/Groups/{id}', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2GroupsPost operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2GroupsPostCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * POST /api/ee/scim/v2/Groups
     * Create a single group, and populates it if necessary.
     * @param {Object} opts Optional parameters
     * @param {module:model/ApiEeScimV2GroupsPostRequest} [apiEeScimV2GroupsPostRequest] 
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2GroupsPostCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2GroupsPost(opts, callback) {
      opts = opts || {};
      let postBody = opts['apiEeScimV2GroupsPostRequest'];

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
        '/api/ee/scim/v2/Groups', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2UsersGet operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2UsersGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/ee/scim/v2/Users
     * Fetch a list of users.
     * @param {Object} opts Optional parameters
     * @param {Number} [startIndex] value must be an integer greater than zero.
     * @param {Number} [count] value must be an integer greater than zero.
     * @param {String} [filter] value must be a non-blank string.
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2UsersGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2UsersGet(opts, callback) {
      opts = opts || {};
      let postBody = null;

      let pathParams = {
      };
      let queryParams = {
        'startIndex': opts['startIndex'],
        'count': opts['count'],
        'filter': opts['filter']
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
        '/api/ee/scim/v2/Users', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2UsersIdGet operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2UsersIdGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/ee/scim/v2/Users/{id}
     * Fetch a single user.
     * @param {String} id value must be a non-blank string.
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2UsersIdGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2UsersIdGet(id, callback) {
      let postBody = null;
      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling apiEeScimV2UsersIdGet");
      }

      let pathParams = {
        'id': id
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
        '/api/ee/scim/v2/Users/{id}', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2UsersIdPatch operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2UsersIdPatchCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PATCH /api/ee/scim/v2/Users/{id}
     * Activate or deactivate a user. Supports specific replace operations, but not arbitrary patches.
     * @param {String} id value must be a non-blank string.
     * @param {Object} opts Optional parameters
     * @param {module:model/ApiEeScimV2UsersIdPatchRequest} [apiEeScimV2UsersIdPatchRequest] 
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2UsersIdPatchCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2UsersIdPatch(id, opts, callback) {
      opts = opts || {};
      let postBody = opts['apiEeScimV2UsersIdPatchRequest'];
      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling apiEeScimV2UsersIdPatch");
      }

      let pathParams = {
        'id': id
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
        '/api/ee/scim/v2/Users/{id}', 'PATCH',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2UsersIdPut operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2UsersIdPutCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PUT /api/ee/scim/v2/Users/{id}
     * Update a user.
     * @param {Object} opts Optional parameters
     * @param {module:model/ApiEeScimV2UsersPostRequest} [apiEeScimV2UsersPostRequest] 
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2UsersIdPutCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2UsersIdPut(opts, callback) {
      opts = opts || {};
      let postBody = opts['apiEeScimV2UsersPostRequest'];

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
        '/api/ee/scim/v2/Users/{id}', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiEeScimV2UsersPost operation.
     * @callback module:api/ApiEeScimV2Api~apiEeScimV2UsersPostCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * POST /api/ee/scim/v2/Users
     * Create a single user.
     * @param {Object} opts Optional parameters
     * @param {module:model/ApiEeScimV2UsersPostRequest} [apiEeScimV2UsersPostRequest] 
     * @param {module:api/ApiEeScimV2Api~apiEeScimV2UsersPostCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiEeScimV2UsersPost(opts, callback) {
      opts = opts || {};
      let postBody = opts['apiEeScimV2UsersPostRequest'];

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
        '/api/ee/scim/v2/Users', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }


}
