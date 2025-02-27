# MetabaseApi.ApiCardApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiCardCardIdParamsParamKeySearchQueryGet**](ApiCardApi.md#apiCardCardIdParamsParamKeySearchQueryGet) | **GET** /api/card/{card-id}/params/{param-key}/search/{query} | GET /api/card/{card-id}/params/{param-key}/search/{query}
[**apiCardCardIdParamsParamKeyValuesGet**](ApiCardApi.md#apiCardCardIdParamsParamKeyValuesGet) | **GET** /api/card/{card-id}/params/{param-key}/values | GET /api/card/{card-id}/params/{param-key}/values
[**apiCardCardIdPublicLinkDelete**](ApiCardApi.md#apiCardCardIdPublicLinkDelete) | **DELETE** /api/card/{card-id}/public_link | DELETE /api/card/{card-id}/public_link
[**apiCardCardIdPublicLinkPost**](ApiCardApi.md#apiCardCardIdPublicLinkPost) | **POST** /api/card/{card-id}/public_link | POST /api/card/{card-id}/public_link
[**apiCardCardIdQueryExportFormatPost**](ApiCardApi.md#apiCardCardIdQueryExportFormatPost) | **POST** /api/card/{card-id}/query/{export-format} | POST /api/card/{card-id}/query/{export-format}
[**apiCardCardIdQueryPost**](ApiCardApi.md#apiCardCardIdQueryPost) | **POST** /api/card/{card-id}/query | POST /api/card/{card-id}/query
[**apiCardCollectionsPost**](ApiCardApi.md#apiCardCollectionsPost) | **POST** /api/card/collections | POST /api/card/collections
[**apiCardEmbeddableGet**](ApiCardApi.md#apiCardEmbeddableGet) | **GET** /api/card/embeddable | GET /api/card/embeddable
[**apiCardFromCsvPost**](ApiCardApi.md#apiCardFromCsvPost) | **POST** /api/card/from-csv | POST /api/card/from-csv
[**apiCardGet**](ApiCardApi.md#apiCardGet) | **GET** /api/card/ | GET /api/card/
[**apiCardIdCopyPost**](ApiCardApi.md#apiCardIdCopyPost) | **POST** /api/card/{id}/copy | POST /api/card/{id}/copy
[**apiCardIdDashboardsGet**](ApiCardApi.md#apiCardIdDashboardsGet) | **GET** /api/card/{id}/dashboards | GET /api/card/{id}/dashboards
[**apiCardIdDelete**](ApiCardApi.md#apiCardIdDelete) | **DELETE** /api/card/{id} | DELETE /api/card/{id}
[**apiCardIdGet**](ApiCardApi.md#apiCardIdGet) | **GET** /api/card/{id} | GET /api/card/{id}
[**apiCardIdPut**](ApiCardApi.md#apiCardIdPut) | **PUT** /api/card/{id} | PUT /api/card/{id}
[**apiCardIdQueryMetadataGet**](ApiCardApi.md#apiCardIdQueryMetadataGet) | **GET** /api/card/{id}/query_metadata | GET /api/card/{id}/query_metadata
[**apiCardIdSeriesGet**](ApiCardApi.md#apiCardIdSeriesGet) | **GET** /api/card/{id}/series | GET /api/card/{id}/series
[**apiCardPivotCardIdQueryPost**](ApiCardApi.md#apiCardPivotCardIdQueryPost) | **POST** /api/card/pivot/{card-id}/query | POST /api/card/pivot/{card-id}/query
[**apiCardPost**](ApiCardApi.md#apiCardPost) | **POST** /api/card/ | POST /api/card/
[**apiCardPublicGet**](ApiCardApi.md#apiCardPublicGet) | **GET** /api/card/public | GET /api/card/public



## apiCardCardIdParamsParamKeySearchQueryGet

> apiCardCardIdParamsParamKeySearchQueryGet(cardId, paramKey, query)

GET /api/card/{card-id}/params/{param-key}/search/{query}

Fetch possible values of the parameter whose ID is &#x60;:param-key&#x60; that contain &#x60;:query&#x60;.      ;; fetch values for Card 1 parameter &#39;abc&#39; that contain &#39;Orange&#39;;      GET /api/card/1/params/abc/search/Orange    Currently limited to first 1000 results.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
let query = "query_example"; // String | value must be a non-blank string.
apiInstance.apiCardCardIdParamsParamKeySearchQueryGet(cardId, paramKey, query, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **paramKey** | **String**| value must be a non-blank string. | 
 **query** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardCardIdParamsParamKeyValuesGet

> apiCardCardIdParamsParamKeyValuesGet(cardId, paramKey)

GET /api/card/{card-id}/params/{param-key}/values

Fetch possible values of the parameter whose ID is &#x60;:param-key&#x60;.      ;; fetch values for Card 1 parameter &#39;abc&#39; that are possible     GET /api/card/1/params/abc/values

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
apiInstance.apiCardCardIdParamsParamKeyValuesGet(cardId, paramKey, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **paramKey** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardCardIdPublicLinkDelete

> apiCardCardIdPublicLinkDelete(cardId)

DELETE /api/card/{card-id}/public_link

Delete the publicly-accessible link to this Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardCardIdPublicLinkDelete(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardCardIdPublicLinkPost

> apiCardCardIdPublicLinkPost(cardId)

POST /api/card/{card-id}/public_link

Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has   already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must   be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardCardIdPublicLinkPost(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardCardIdQueryExportFormatPost

> apiCardCardIdQueryExportFormatPost(cardId, exportFormat, opts)

POST /api/card/{card-id}/query/{export-format}

Run the query associated with a Card, and return its results as a file in the specified format.    &#x60;parameters&#x60; should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint   is normally used to power &#39;Download Results&#39; buttons that use HTML &#x60;form&#x60; actions).

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
let exportFormat = "exportFormat_example"; // String | 
let opts = {
  'apiCardCardIdQueryExportFormatPostRequest': new MetabaseApi.ApiCardCardIdQueryExportFormatPostRequest() // ApiCardCardIdQueryExportFormatPostRequest | 
};
apiInstance.apiCardCardIdQueryExportFormatPost(cardId, exportFormat, opts, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **exportFormat** | **String**|  | 
 **apiCardCardIdQueryExportFormatPostRequest** | [**ApiCardCardIdQueryExportFormatPostRequest**](ApiCardCardIdQueryExportFormatPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardCardIdQueryPost

> apiCardCardIdQueryPost(cardId, opts)

POST /api/card/{card-id}/query

Run the query associated with a Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiCardCardIdQueryPostRequest': new MetabaseApi.ApiCardCardIdQueryPostRequest() // ApiCardCardIdQueryPostRequest | 
};
apiInstance.apiCardCardIdQueryPost(cardId, opts, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **apiCardCardIdQueryPostRequest** | [**ApiCardCardIdQueryPostRequest**](ApiCardCardIdQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardCollectionsPost

> apiCardCollectionsPost(opts)

POST /api/card/collections

Bulk update endpoint for Card Collections. Move a set of &#x60;Cards&#x60; with &#x60;card_ids&#x60; into a &#x60;Collection&#x60; with   &#x60;collection_id&#x60;, or remove them from any Collections by passing a &#x60;null&#x60; &#x60;collection_id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let opts = {
  'apiCardCollectionsPostRequest': new MetabaseApi.ApiCardCollectionsPostRequest() // ApiCardCollectionsPostRequest | 
};
apiInstance.apiCardCollectionsPost(opts, (error, data, response) => {
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
 **apiCardCollectionsPostRequest** | [**ApiCardCollectionsPostRequest**](ApiCardCollectionsPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardEmbeddableGet

> apiCardEmbeddableGet()

GET /api/card/embeddable

Fetch a list of Cards where &#x60;enable_embedding&#x60; is &#x60;true&#x60;. The cards can be embedded using the embedding endpoints   and a signed JWT.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
apiInstance.apiCardEmbeddableGet((error, data, response) => {
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


## apiCardFromCsvPost

> apiCardFromCsvPost(file, opts)

POST /api/card/from-csv

Create a table and model populated with the values from the attached CSV. Returns the model ID if successful.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let file = new MetabaseApi.ApiCardFromCsvPostRequestFile(); // ApiCardFromCsvPostRequestFile | 
let opts = {
  'collectionId': 56 // Number | 
};
apiInstance.apiCardFromCsvPost(file, opts, (error, data, response) => {
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
 **file** | [**ApiCardFromCsvPostRequestFile**](ApiCardFromCsvPostRequestFile.md)|  | 
 **collectionId** | **Number**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: Not defined


## apiCardGet

> apiCardGet(f, opts)

GET /api/card/

Get all the Cards. Option filter param &#x60;f&#x60; can be used to change the set of Cards that are returned; default is   &#x60;all&#x60;, but other options include &#x60;mine&#x60;, &#x60;bookmarked&#x60;, &#x60;database&#x60;, &#x60;table&#x60;, &#x60;using_model&#x60;, &#x60;using_metric&#x60;,   &#x60;using_segment&#x60;, and &#x60;archived&#x60;. See corresponding implementation functions above for the specific behavior   of each filter option. :card_index:

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let f = "'all'"; // String | 
let opts = {
  'modelId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiCardGet(f, opts, (error, data, response) => {
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
 **f** | **String**|  | [default to &#39;all&#39;]
 **modelId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdCopyPost

> apiCardIdCopyPost(id)

POST /api/card/{id}/copy

Copy a &#x60;Card&#x60;, with the new name &#39;Copy of _name_&#39;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardIdCopyPost(id, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdDashboardsGet

> apiCardIdDashboardsGet(id)

GET /api/card/{id}/dashboards

Get a list of &#x60;{:name ... :id ...}&#x60; pairs for all the dashboards this card appears in.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardIdDashboardsGet(id, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdDelete

> apiCardIdDelete(id)

DELETE /api/card/{id}

Hard delete a Card. To soft delete, use &#x60;PUT /api/card/:id&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardIdDelete(id, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdGet

> apiCardIdGet(id, opts)

GET /api/card/{id}

Get &#x60;Card&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'ignoreView': true, // Boolean | 
  'context': "context_example" // String | 
};
apiInstance.apiCardIdGet(id, opts, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 
 **ignoreView** | **Boolean**|  | [optional] 
 **context** | **String**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdPut

> apiCardIdPut(id, opts)

PUT /api/card/{id}

Update a &#x60;Card&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'deleteOldDashcards': true, // Boolean | 
  'apiCardIdPutRequest': new MetabaseApi.ApiCardIdPutRequest() // ApiCardIdPutRequest | 
};
apiInstance.apiCardIdPut(id, opts, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 
 **deleteOldDashcards** | **Boolean**|  | [optional] 
 **apiCardIdPutRequest** | [**ApiCardIdPutRequest**](ApiCardIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardIdQueryMetadataGet

> apiCardIdQueryMetadataGet(id)

GET /api/card/{id}/query_metadata

Get all of the required query metadata for a card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCardIdQueryMetadataGet(id, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardIdSeriesGet

> apiCardIdSeriesGet(id, opts)

GET /api/card/{id}/series

Fetches a list of compatible series with the card with id &#x60;card_id&#x60;.    - &#x60;last_cursor&#x60; with value is the id of the last card from the previous page to fetch the next page.   - &#x60;query&#x60; to search card by name.   - &#x60;exclude_ids&#x60; to filter out a list of card ids

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let id = 56; // Number | 
let opts = {
  'lastCursor': 56, // Number | value must be an integer greater than zero.
  'query': "query_example", // String | value must be a non-blank string.
  'excludeIds': null // Object | 
};
apiInstance.apiCardIdSeriesGet(id, opts, (error, data, response) => {
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
 **id** | **Number**|  | 
 **lastCursor** | **Number**| value must be an integer greater than zero. | [optional] 
 **query** | **String**| value must be a non-blank string. | [optional] 
 **excludeIds** | [**Object**](.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCardPivotCardIdQueryPost

> apiCardPivotCardIdQueryPost(cardId, opts)

POST /api/card/pivot/{card-id}/query

Run the query associated with a Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let cardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiCardPivotCardIdQueryPostRequest': new MetabaseApi.ApiCardPivotCardIdQueryPostRequest() // ApiCardPivotCardIdQueryPostRequest | 
};
apiInstance.apiCardPivotCardIdQueryPost(cardId, opts, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **apiCardPivotCardIdQueryPostRequest** | [**ApiCardPivotCardIdQueryPostRequest**](ApiCardPivotCardIdQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardPost

> apiCardPost(opts)

POST /api/card/

Create a new &#x60;Card&#x60;. Card &#x60;type&#x60; can be &#x60;question&#x60;, &#x60;metric&#x60;, or &#x60;model&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
let opts = {
  'apiCardPostRequest': new MetabaseApi.ApiCardPostRequest() // ApiCardPostRequest | 
};
apiInstance.apiCardPost(opts, (error, data, response) => {
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
 **apiCardPostRequest** | [**ApiCardPostRequest**](ApiCardPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardPublicGet

> apiCardPublicGet()

GET /api/card/public

Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardApi();
apiInstance.apiCardPublicGet((error, data, response) => {
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

