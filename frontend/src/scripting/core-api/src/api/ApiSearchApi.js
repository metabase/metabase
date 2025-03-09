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
* ApiSearch service.
* @module api/ApiSearchApi
* @version v1.53.2-SNAPSHOT
*/
export default class ApiSearchApi {

    /**
    * Constructs a new ApiSearchApi. 
    * @alias module:api/ApiSearchApi
    * @class
    * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
    * default to {@link module:ApiClient#instance} if unspecified.
    */
    constructor(apiClient) {
        this.apiClient = apiClient || ApiClient.instance;
    }


    /**
     * Callback function to receive the result of the apiSearchForceReindexPost operation.
     * @callback module:api/ApiSearchApi~apiSearchForceReindexPostCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * POST /api/search/force-reindex
     * This will trigger an immediate reindexing, if we are using search index.
     * @param {module:api/ApiSearchApi~apiSearchForceReindexPostCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSearchForceReindexPost(callback) {
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
        '/api/search/force-reindex', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSearchGet operation.
     * @callback module:api/ApiSearchApi~apiSearchGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/search/
     * Search for items in Metabase.   For the list of supported models, check [[metabase.search.config/all-models]].    Filters:   - `archived`: set to true to search archived items only, default is false   - `table_db_id`: search for tables, cards, and models of a certain DB   - `models`: only search for items of specific models. If not provided, search for all models   - `filters_items_in_personal_collection`: only search for items in personal collections   - `created_at`: search for items created at a specific timestamp   - `created_by`: search for items created by a specific user   - `last_edited_at`: search for items last edited at a specific timestamp   - `last_edited_by`: search for items last edited by a specific user   - `search_native_query`: set to true to search the content of native queries   - `verified`: set to true to search for verified items only (requires Content Management or Official Collections premium feature)   - `ids`: search for items with those ids, works iff single value passed to `models`    Note that not all item types support all filters, and the results will include only models that support the provided filters. For example:   - The `created-by` filter supports dashboards, models, actions, and cards.   - The `verified` filter supports models and cards.    A search query that has both filters applied will only return models and cards.
     * @param {Object} opts Optional parameters
     * @param {String} [q] value must be a non-blank string.
     * @param {String} [context] 
     * @param {Boolean} [archived = false)] 
     * @param {Number} [tableDbId] value must be an integer greater than zero.
     * @param {Array.<module:model/String>} [models] 
     * @param {module:model/String} [filterItemsInPersonalCollection] 
     * @param {String} [createdAt] value must be a non-blank string.
     * @param {Array.<Number>} [createdBy] 
     * @param {String} [lastEditedAt] value must be a non-blank string.
     * @param {Array.<Number>} [lastEditedBy] 
     * @param {Boolean} [modelAncestors = false)] 
     * @param {String} [searchEngine] 
     * @param {Boolean} [searchNativeQuery] 
     * @param {Boolean} [verified] 
     * @param {Array.<Number>} [ids] 
     * @param {Boolean} [calculateAvailableModels] 
     * @param {Boolean} [includeDashboardQuestions = false)] 
     * @param {module:api/ApiSearchApi~apiSearchGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSearchGet(opts, callback) {
      opts = opts || {};
      let postBody = null;

      let pathParams = {
      };
      let queryParams = {
        'q': opts['q'],
        'context': opts['context'],
        'archived': opts['archived'],
        'table_db_id': opts['tableDbId'],
        'models': this.apiClient.buildCollectionParam(opts['models'], 'multi'),
        'filter_items_in_personal_collection': opts['filterItemsInPersonalCollection'],
        'created_at': opts['createdAt'],
        'created_by': this.apiClient.buildCollectionParam(opts['createdBy'], 'multi'),
        'last_edited_at': opts['lastEditedAt'],
        'last_edited_by': this.apiClient.buildCollectionParam(opts['lastEditedBy'], 'multi'),
        'model_ancestors': opts['modelAncestors'],
        'search_engine': opts['searchEngine'],
        'search_native_query': opts['searchNativeQuery'],
        'verified': opts['verified'],
        'ids': this.apiClient.buildCollectionParam(opts['ids'], 'multi'),
        'calculate_available_models': opts['calculateAvailableModels'],
        'include_dashboard_questions': opts['includeDashboardQuestions']
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
        '/api/search/', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSearchReInitPost operation.
     * @callback module:api/ApiSearchApi~apiSearchReInitPostCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * POST /api/search/re-init
     * This will blow away any search indexes, re-create, and re-populate them.
     * @param {module:api/ApiSearchApi~apiSearchReInitPostCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSearchReInitPost(callback) {
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
        '/api/search/re-init', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSearchWeightsGet operation.
     * @callback module:api/ApiSearchApi~apiSearchWeightsGetCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * GET /api/search/weights
     * Return the current weights being used to rank the search results
     * @param {String} context 
     * @param {Object} opts Optional parameters
     * @param {Object} [searchEngine] 
     * @param {module:api/ApiSearchApi~apiSearchWeightsGetCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSearchWeightsGet(context, opts, callback) {
      opts = opts || {};
      let postBody = null;
      // verify the required parameter 'context' is set
      if (context === undefined || context === null) {
        throw new Error("Missing the required parameter 'context' when calling apiSearchWeightsGet");
      }

      let pathParams = {
      };
      let queryParams = {
        'context': context,
        'search_engine': opts['searchEngine']
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
        '/api/search/weights', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }

    /**
     * Callback function to receive the result of the apiSearchWeightsPut operation.
     * @callback module:api/ApiSearchApi~apiSearchWeightsPutCallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * PUT /api/search/weights
     * Update the current weights being used to rank the search results
     * @param {String} context 
     * @param {Object} opts Optional parameters
     * @param {Object} [searchEngine] 
     * @param {module:api/ApiSearchApi~apiSearchWeightsPutCallback} callback The callback function, accepting three arguments: error, data, response
     */
    apiSearchWeightsPut(context, opts, callback) {
      opts = opts || {};
      let postBody = null;
      // verify the required parameter 'context' is set
      if (context === undefined || context === null) {
        throw new Error("Missing the required parameter 'context' when calling apiSearchWeightsPut");
      }

      let pathParams = {
      };
      let queryParams = {
        'context': context,
        'search_engine': opts['searchEngine']
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
        '/api/search/weights', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, null, callback
      );
    }


}
