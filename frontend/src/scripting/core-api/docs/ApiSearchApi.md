# MetabaseApi.ApiSearchApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSearchForceReindexPost**](ApiSearchApi.md#apiSearchForceReindexPost) | **POST** /api/search/force-reindex | POST /api/search/force-reindex
[**apiSearchGet**](ApiSearchApi.md#apiSearchGet) | **GET** /api/search/ | GET /api/search/
[**apiSearchReInitPost**](ApiSearchApi.md#apiSearchReInitPost) | **POST** /api/search/re-init | POST /api/search/re-init
[**apiSearchWeightsGet**](ApiSearchApi.md#apiSearchWeightsGet) | **GET** /api/search/weights | GET /api/search/weights
[**apiSearchWeightsPut**](ApiSearchApi.md#apiSearchWeightsPut) | **PUT** /api/search/weights | PUT /api/search/weights



## apiSearchForceReindexPost

> apiSearchForceReindexPost()

POST /api/search/force-reindex

This will trigger an immediate reindexing, if we are using search index.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSearchApi();
apiInstance.apiSearchForceReindexPost((error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully.');
  }
});
```

### Parameters

This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSearchGet

> apiSearchGet(opts)

GET /api/search/

Search for items in Metabase.   For the list of supported models, check [[metabase.search.config/all-models]].    Filters:   - &#x60;archived&#x60;: set to true to search archived items only, default is false   - &#x60;table_db_id&#x60;: search for tables, cards, and models of a certain DB   - &#x60;models&#x60;: only search for items of specific models. If not provided, search for all models   - &#x60;filters_items_in_personal_collection&#x60;: only search for items in personal collections   - &#x60;created_at&#x60;: search for items created at a specific timestamp   - &#x60;created_by&#x60;: search for items created by a specific user   - &#x60;last_edited_at&#x60;: search for items last edited at a specific timestamp   - &#x60;last_edited_by&#x60;: search for items last edited by a specific user   - &#x60;search_native_query&#x60;: set to true to search the content of native queries   - &#x60;verified&#x60;: set to true to search for verified items only (requires Content Management or Official Collections premium feature)   - &#x60;ids&#x60;: search for items with those ids, works iff single value passed to &#x60;models&#x60;    Note that not all item types support all filters, and the results will include only models that support the provided filters. For example:   - The &#x60;created-by&#x60; filter supports dashboards, models, actions, and cards.   - The &#x60;verified&#x60; filter supports models and cards.    A search query that has both filters applied will only return models and cards.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSearchApi();
let opts = {
  'q': "q_example", // String | value must be a non-blank string.
  'context': "context_example", // String | 
  'archived': false, // Boolean | 
  'tableDbId': 56, // Number | value must be an integer greater than zero.
  'models': ["null"], // [String] | 
  'filterItemsInPersonalCollection': "filterItemsInPersonalCollection_example", // String | 
  'createdAt': "createdAt_example", // String | value must be a non-blank string.
  'createdBy': [null], // [Number] | 
  'lastEditedAt': "lastEditedAt_example", // String | value must be a non-blank string.
  'lastEditedBy': [null], // [Number] | 
  'modelAncestors': false, // Boolean | 
  'searchEngine': "searchEngine_example", // String | 
  'searchNativeQuery': true, // Boolean | 
  'verified': true, // Boolean | 
  'ids': [null], // [Number] | 
  'calculateAvailableModels': true, // Boolean | 
  'includeDashboardQuestions': false // Boolean | 
};
apiInstance.apiSearchGet(opts, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully.');
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **String**| value must be a non-blank string. | [optional] 
 **context** | **String**|  | [optional] 
 **archived** | **Boolean**|  | [optional] [default to false]
 **tableDbId** | **Number**| value must be an integer greater than zero. | [optional] 
 **models** | [**[String]**](String.md)|  | [optional] 
 **filterItemsInPersonalCollection** | **String**|  | [optional] 
 **createdAt** | **String**| value must be a non-blank string. | [optional] 
 **createdBy** | [**[Number]**](Number.md)|  | [optional] 
 **lastEditedAt** | **String**| value must be a non-blank string. | [optional] 
 **lastEditedBy** | [**[Number]**](Number.md)|  | [optional] 
 **modelAncestors** | **Boolean**|  | [optional] [default to false]
 **searchEngine** | **String**|  | [optional] 
 **searchNativeQuery** | **Boolean**|  | [optional] 
 **verified** | **Boolean**|  | [optional] 
 **ids** | [**[Number]**](Number.md)|  | [optional] 
 **calculateAvailableModels** | **Boolean**|  | [optional] 
 **includeDashboardQuestions** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSearchReInitPost

> apiSearchReInitPost()

POST /api/search/re-init

This will blow away any search indexes, re-create, and re-populate them.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSearchApi();
apiInstance.apiSearchReInitPost((error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully.');
  }
});
```

### Parameters

This endpoint does not need any parameter.

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSearchWeightsGet

> apiSearchWeightsGet(context, opts)

GET /api/search/weights

Return the current weights being used to rank the search results

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSearchApi();
let context = "'default'"; // String | 
let opts = {
  'searchEngine': null // Object | 
};
apiInstance.apiSearchWeightsGet(context, opts, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully.');
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **context** | **String**|  | [default to &#39;default&#39;]
 **searchEngine** | [**Object**](.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSearchWeightsPut

> apiSearchWeightsPut(context, opts)

PUT /api/search/weights

Update the current weights being used to rank the search results

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSearchApi();
let context = "'default'"; // String | 
let opts = {
  'searchEngine': null // Object | 
};
apiInstance.apiSearchWeightsPut(context, opts, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully.');
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **context** | **String**|  | [default to &#39;default&#39;]
 **searchEngine** | [**Object**](.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

