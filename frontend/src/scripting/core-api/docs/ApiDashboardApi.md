# MetabaseApi.ApiDashboardApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPost**](ApiDashboardApi.md#apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPost) | **POST** /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query/{export-format} | POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query/{export-format}
[**apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPost**](ApiDashboardApi.md#apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPost) | **POST** /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query | POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query
[**apiDashboardDashboardIdDashcardDashcardIdExecuteGet**](ApiDashboardApi.md#apiDashboardDashboardIdDashcardDashcardIdExecuteGet) | **GET** /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute | GET /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute
[**apiDashboardDashboardIdDashcardDashcardIdExecutePost**](ApiDashboardApi.md#apiDashboardDashboardIdDashcardDashcardIdExecutePost) | **POST** /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute | POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute
[**apiDashboardDashboardIdPublicLinkDelete**](ApiDashboardApi.md#apiDashboardDashboardIdPublicLinkDelete) | **DELETE** /api/dashboard/{dashboard-id}/public_link | DELETE /api/dashboard/{dashboard-id}/public_link
[**apiDashboardDashboardIdPublicLinkPost**](ApiDashboardApi.md#apiDashboardDashboardIdPublicLinkPost) | **POST** /api/dashboard/{dashboard-id}/public_link | POST /api/dashboard/{dashboard-id}/public_link
[**apiDashboardEmbeddableGet**](ApiDashboardApi.md#apiDashboardEmbeddableGet) | **GET** /api/dashboard/embeddable | GET /api/dashboard/embeddable
[**apiDashboardFromDashboardIdCopyPost**](ApiDashboardApi.md#apiDashboardFromDashboardIdCopyPost) | **POST** /api/dashboard/{from-dashboard-id}/copy | POST /api/dashboard/{from-dashboard-id}/copy
[**apiDashboardGet**](ApiDashboardApi.md#apiDashboardGet) | **GET** /api/dashboard/ | GET /api/dashboard/
[**apiDashboardIdCardsPut**](ApiDashboardApi.md#apiDashboardIdCardsPut) | **PUT** /api/dashboard/{id}/cards | PUT /api/dashboard/{id}/cards
[**apiDashboardIdDelete**](ApiDashboardApi.md#apiDashboardIdDelete) | **DELETE** /api/dashboard/{id} | DELETE /api/dashboard/{id}
[**apiDashboardIdGet**](ApiDashboardApi.md#apiDashboardIdGet) | **GET** /api/dashboard/{id} | GET /api/dashboard/{id}
[**apiDashboardIdItemsGet**](ApiDashboardApi.md#apiDashboardIdItemsGet) | **GET** /api/dashboard/{id}/items | GET /api/dashboard/{id}/items
[**apiDashboardIdParamsParamKeySearchQueryGet**](ApiDashboardApi.md#apiDashboardIdParamsParamKeySearchQueryGet) | **GET** /api/dashboard/{id}/params/{param-key}/search/{query} | GET /api/dashboard/{id}/params/{param-key}/search/{query}
[**apiDashboardIdParamsParamKeyValuesGet**](ApiDashboardApi.md#apiDashboardIdParamsParamKeyValuesGet) | **GET** /api/dashboard/{id}/params/{param-key}/values | GET /api/dashboard/{id}/params/{param-key}/values
[**apiDashboardIdPut**](ApiDashboardApi.md#apiDashboardIdPut) | **PUT** /api/dashboard/{id} | PUT /api/dashboard/{id}
[**apiDashboardIdQueryMetadataGet**](ApiDashboardApi.md#apiDashboardIdQueryMetadataGet) | **GET** /api/dashboard/{id}/query_metadata | GET /api/dashboard/{id}/query_metadata
[**apiDashboardIdRelatedGet**](ApiDashboardApi.md#apiDashboardIdRelatedGet) | **GET** /api/dashboard/{id}/related | GET /api/dashboard/{id}/related
[**apiDashboardParamsValidFilterFieldsGet**](ApiDashboardApi.md#apiDashboardParamsValidFilterFieldsGet) | **GET** /api/dashboard/params/valid-filter-fields | GET /api/dashboard/params/valid-filter-fields
[**apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPost**](ApiDashboardApi.md#apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPost) | **POST** /api/dashboard/pivot/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query | POST /api/dashboard/pivot/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query
[**apiDashboardPost**](ApiDashboardApi.md#apiDashboardPost) | **POST** /api/dashboard/ | POST /api/dashboard/
[**apiDashboardPublicGet**](ApiDashboardApi.md#apiDashboardPublicGet) | **GET** /api/dashboard/public | GET /api/dashboard/public
[**apiDashboardSaveCollectionParentCollectionIdPost**](ApiDashboardApi.md#apiDashboardSaveCollectionParentCollectionIdPost) | **POST** /api/dashboard/save/collection/{parent-collection-id} | POST /api/dashboard/save/collection/{parent-collection-id}
[**apiDashboardSavePost**](ApiDashboardApi.md#apiDashboardSavePost) | **POST** /api/dashboard/save | POST /api/dashboard/save



## apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPost

> apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPost(dashboardId, dashcardId, cardId, exportFormat, opts)

POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query/{export-format}

Run the query associated with a Saved Question (&#x60;Card&#x60;) in the context of a &#x60;Dashboard&#x60; that includes it, and return   its results as a file in the specified format.    &#x60;parameters&#x60; should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint   is normally used to power &#39;Download Results&#39; buttons that use HTML &#x60;form&#x60; actions).

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let exportFormat = "exportFormat_example"; // String | 
let opts = {
  'apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest': new MetabaseApi.ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest() // ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest | 
};
apiInstance.apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPost(dashboardId, dashcardId, cardId, exportFormat, opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **exportFormat** | **String**|  | 
 **apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest** | [**ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest**](ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryExportFormatPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPost

> apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPost(dashboardId, dashcardId, cardId, opts)

POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query

Run the query associated with a Saved Question (&#x60;Card&#x60;) in the context of a &#x60;Dashboard&#x60; that includes it.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest': new MetabaseApi.ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest() // ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest | 
};
apiInstance.apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPost(dashboardId, dashcardId, cardId, opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **apiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest** | [**ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest**](ApiDashboardDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardDashboardIdDashcardDashcardIdExecuteGet

> apiDashboardDashboardIdDashcardDashcardIdExecuteGet(dashboardId, dashcardId, opts)

GET /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiDashboardDashboardIdDashcardDashcardIdExecuteGet(dashboardId, dashcardId, opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardDashboardIdDashcardDashcardIdExecutePost

> apiDashboardDashboardIdDashcardDashcardIdExecutePost(dashboardId, dashcardId, opts)

POST /api/dashboard/{dashboard-id}/dashcard/{dashcard-id}/execute

Execute the associated Action in the context of a &#x60;Dashboard&#x60; and &#x60;DashboardCard&#x60; that includes it.     &#x60;parameters&#x60; should be the mapped dashboard parameters with values.    &#x60;extra_parameters&#x60; should be the extra, user entered parameter values.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest': new MetabaseApi.ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest() // ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest | 
};
apiInstance.apiDashboardDashboardIdDashcardDashcardIdExecutePost(dashboardId, dashcardId, opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest** | [**ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest**](ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardDashboardIdPublicLinkDelete

> apiDashboardDashboardIdPublicLinkDelete(dashboardId)

DELETE /api/dashboard/{dashboard-id}/public_link

Delete the publicly-accessible link to this Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardDashboardIdPublicLinkDelete(dashboardId, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardDashboardIdPublicLinkPost

> apiDashboardDashboardIdPublicLinkPost(dashboardId)

POST /api/dashboard/{dashboard-id}/public_link

Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this   Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public   sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardDashboardIdPublicLinkPost(dashboardId, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardEmbeddableGet

> apiDashboardEmbeddableGet()

GET /api/dashboard/embeddable

Fetch a list of Dashboards where &#x60;enable_embedding&#x60; is &#x60;true&#x60;. The dashboards can be embedded using the embedding   endpoints and a signed JWT.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
apiInstance.apiDashboardEmbeddableGet((error, data, response) => {
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


## apiDashboardFromDashboardIdCopyPost

> apiDashboardFromDashboardIdCopyPost(fromDashboardId, opts)

POST /api/dashboard/{from-dashboard-id}/copy

Copy a Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let fromDashboardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardFromDashboardIdCopyPostRequest': new MetabaseApi.ApiDashboardFromDashboardIdCopyPostRequest() // ApiDashboardFromDashboardIdCopyPostRequest | 
};
apiInstance.apiDashboardFromDashboardIdCopyPost(fromDashboardId, opts, (error, data, response) => {
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
 **fromDashboardId** | **Number**| value must be an integer greater than zero. | 
 **apiDashboardFromDashboardIdCopyPostRequest** | [**ApiDashboardFromDashboardIdCopyPostRequest**](ApiDashboardFromDashboardIdCopyPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardGet

> apiDashboardGet(opts)

GET /api/dashboard/

This endpoint is currently unused by the Metabase frontend and may be out of date with the rest of the application.   It only exists for backwards compatibility and may be removed in the future.    Get &#x60;Dashboards&#x60;. With filter option &#x60;f&#x60; (default &#x60;all&#x60;), restrict results as follows:   *  &#x60;all&#x60;      - Return all Dashboards.   *  &#x60;mine&#x60;     - Return Dashboards created by the current user.   *  &#x60;archived&#x60; - Return Dashboards that have been archived. (By default, these are *excluded*.)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let opts = {
  'f': "f_example" // String | 
};
apiInstance.apiDashboardGet(opts, (error, data, response) => {
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
 **f** | **String**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardIdCardsPut

> apiDashboardIdCardsPut(id, opts)

PUT /api/dashboard/{id}/cards

(DEPRECATED -- Use the &#x60;PUT /api/dashboard/:id&#x60; endpoint instead.)    Update &#x60;Cards&#x60; and &#x60;Tabs&#x60; on a Dashboard. Request body should have the form:      {:cards        [{:id                 ... ; DashboardCard ID                      :size_x             ...                      :size_y             ...                      :row                ...                      :col                ...                      :parameter_mappings ...                      :series             [{:id 123                                            ...}]}                      ...]      :tabs [{:id       ... ; DashboardTab ID                      :name     ...}]}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardIdCardsPutRequest': new MetabaseApi.ApiDashboardIdCardsPutRequest() // ApiDashboardIdCardsPutRequest | 
};
apiInstance.apiDashboardIdCardsPut(id, opts, (error, data, response) => {
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
 **apiDashboardIdCardsPutRequest** | [**ApiDashboardIdCardsPutRequest**](ApiDashboardIdCardsPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardIdDelete

> apiDashboardIdDelete(id)

DELETE /api/dashboard/{id}

Hard delete a Dashboard. To soft delete, use &#x60;PUT /api/dashboard/:id&#x60;    This will remove also any questions/models/segments/metrics that use this database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdDelete(id, (error, data, response) => {
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


## apiDashboardIdGet

> apiDashboardIdGet(id)

GET /api/dashboard/{id}

Get Dashboard with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdGet(id, (error, data, response) => {
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


## apiDashboardIdItemsGet

> apiDashboardIdItemsGet(id)

GET /api/dashboard/{id}/items

Get Dashboard with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdItemsGet(id, (error, data, response) => {
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


## apiDashboardIdParamsParamKeySearchQueryGet

> apiDashboardIdParamsParamKeySearchQueryGet(id, query)

GET /api/dashboard/{id}/params/{param-key}/search/{query}

Fetch possible values of the parameter whose ID is &#x60;:param-key&#x60; that contain &#x60;:query&#x60;. Optionally restrict   these values by passing query parameters like &#x60;other-parameter&#x3D;value&#x60; e.g.      ;; fetch values for Dashboard 1 parameter &#39;abc&#39; that contain &#39;Cam&#39; and are possible when parameter &#39;def&#39; is set     ;; to 100      GET /api/dashboard/1/params/abc/search/Cam?def&#x3D;100    Currently limited to first 1000 results.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
let query = "query_example"; // String | value must be a non-blank string.
apiInstance.apiDashboardIdParamsParamKeySearchQueryGet(id, query, (error, data, response) => {
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
 **query** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardIdParamsParamKeyValuesGet

> apiDashboardIdParamsParamKeyValuesGet(id)

GET /api/dashboard/{id}/params/{param-key}/values

Fetch possible values of the parameter whose ID is &#x60;:param-key&#x60;. If the values come directly from a query, optionally   restrict these values by passing query parameters like &#x60;other-parameter&#x3D;value&#x60; e.g.      ;; fetch values for Dashboard 1 parameter &#39;abc&#39; that are possible when parameter &#39;def&#39; is set to 100     GET /api/dashboard/1/params/abc/values?def&#x3D;100

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdParamsParamKeyValuesGet(id, (error, data, response) => {
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


## apiDashboardIdPut

> apiDashboardIdPut(id, opts)

PUT /api/dashboard/{id}

Update a Dashboard, and optionally the &#x60;dashcards&#x60; and &#x60;tabs&#x60; of a Dashboard. The request body should be a JSON object with the same   structure as the response from &#x60;GET /api/dashboard/:id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardIdPutRequest': new MetabaseApi.ApiDashboardIdPutRequest() // ApiDashboardIdPutRequest | 
};
apiInstance.apiDashboardIdPut(id, opts, (error, data, response) => {
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
 **apiDashboardIdPutRequest** | [**ApiDashboardIdPutRequest**](ApiDashboardIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardIdQueryMetadataGet

> apiDashboardIdQueryMetadataGet(id)

GET /api/dashboard/{id}/query_metadata

Get all of the required query metadata for the cards on dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdQueryMetadataGet(id, (error, data, response) => {
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


## apiDashboardIdRelatedGet

> apiDashboardIdRelatedGet(id)

GET /api/dashboard/{id}/related

Return related entities.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardIdRelatedGet(id, (error, data, response) => {
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


## apiDashboardParamsValidFilterFieldsGet

> apiDashboardParamsValidFilterFieldsGet(filtered, opts)

GET /api/dashboard/params/valid-filter-fields

Utility endpoint for powering Dashboard UI. Given some set of &#x60;filtered&#x60; Field IDs (presumably Fields used in   parameters) and a set of &#x60;filtering&#x60; Field IDs that will be used to restrict values of &#x60;filtered&#x60; Fields, for each   &#x60;filtered&#x60; Field ID return the subset of &#x60;filtering&#x60; Field IDs that would actually be used in a chain filter query   with these Fields.    e.g. in a chain filter query like    GET /api/dashboard/10/params/PARAM_1/values?PARAM_2&#x3D;100    Assume &#x60;PARAM_1&#x60; maps to Field 1 and &#x60;PARAM_2&#x60; maps to Fields 2 and 3. The underlying MBQL query may or may not   filter against Fields 2 and 3, depending on whether an FK relationship that lets us create a join against Field 1   can be found. You can use this endpoint to determine which of those Fields is actually used:    GET /api/dashboard/params/valid-filter-fields?filtered&#x3D;1&amp;filtering&#x3D;2&amp;filtering&#x3D;3   ;; -&gt;   {1 [2 3]}    Results are returned as a map of    &#x60;filtered&#x60; Field ID -&gt; subset of &#x60;filtering&#x60; Field IDs that would be used in chain filter query

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let filtered = [null]; // [Number] | 
let opts = {
  'filtering': [null] // [Number] | 
};
apiInstance.apiDashboardParamsValidFilterFieldsGet(filtered, opts, (error, data, response) => {
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
 **filtered** | [**[Number]**](Number.md)|  | 
 **filtering** | [**[Number]**](Number.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPost

> apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPost(dashboardId, dashcardId, cardId, opts)

POST /api/dashboard/pivot/{dashboard-id}/dashcard/{dashcard-id}/card/{card-id}/query

Run a pivot table query for a specific DashCard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let dashboardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest': new MetabaseApi.ApiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest() // ApiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest | 
};
apiInstance.apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPost(dashboardId, dashcardId, cardId, opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **apiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest** | [**ApiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest**](ApiDashboardPivotDashboardIdDashcardDashcardIdCardCardIdQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardPost

> apiDashboardPost(opts)

POST /api/dashboard/

Create a new Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let opts = {
  'apiDashboardPostRequest': new MetabaseApi.ApiDashboardPostRequest() // ApiDashboardPostRequest | 
};
apiInstance.apiDashboardPost(opts, (error, data, response) => {
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
 **apiDashboardPostRequest** | [**ApiDashboardPostRequest**](ApiDashboardPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDashboardPublicGet

> apiDashboardPublicGet()

GET /api/dashboard/public

Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is   enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
apiInstance.apiDashboardPublicGet((error, data, response) => {
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


## apiDashboardSaveCollectionParentCollectionIdPost

> apiDashboardSaveCollectionParentCollectionIdPost(parentCollectionId)

POST /api/dashboard/save/collection/{parent-collection-id}

Save a denormalized description of dashboard into collection with ID &#x60;:parent-collection-id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
let parentCollectionId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDashboardSaveCollectionParentCollectionIdPost(parentCollectionId, (error, data, response) => {
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
 **parentCollectionId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDashboardSavePost

> apiDashboardSavePost()

POST /api/dashboard/save

Save a denormalized description of dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDashboardApi();
apiInstance.apiDashboardSavePost((error, data, response) => {
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

