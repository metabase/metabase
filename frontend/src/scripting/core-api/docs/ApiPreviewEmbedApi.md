# MetabaseApi.ApiPreviewEmbedApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPreviewEmbedCardTokenGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedCardTokenGet) | **GET** /api/preview_embed/card/{token} | GET /api/preview_embed/card/{token}
[**apiPreviewEmbedCardTokenQueryGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedCardTokenQueryGet) | **GET** /api/preview_embed/card/{token}/query | GET /api/preview_embed/card/{token}/query
[**apiPreviewEmbedDashboardTokenDashcardDashcardIdCardCardIdGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedDashboardTokenDashcardDashcardIdCardCardIdGet) | **GET** /api/preview_embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id} | GET /api/preview_embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}
[**apiPreviewEmbedDashboardTokenGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedDashboardTokenGet) | **GET** /api/preview_embed/dashboard/{token} | GET /api/preview_embed/dashboard/{token}
[**apiPreviewEmbedDashboardTokenParamsParamKeyValuesGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedDashboardTokenParamsParamKeyValuesGet) | **GET** /api/preview_embed/dashboard/{token}/params/{param-key}/values | GET /api/preview_embed/dashboard/{token}/params/{param-key}/values
[**apiPreviewEmbedPivotCardTokenQueryGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedPivotCardTokenQueryGet) | **GET** /api/preview_embed/pivot/card/{token}/query | GET /api/preview_embed/pivot/card/{token}/query
[**apiPreviewEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet**](ApiPreviewEmbedApi.md#apiPreviewEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet) | **GET** /api/preview_embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id} | GET /api/preview_embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}



## apiPreviewEmbedCardTokenGet

> apiPreviewEmbedCardTokenGet(token)

GET /api/preview_embed/card/{token}

Fetch a Card you&#39;re considering embedding by passing a JWT &#x60;token&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
apiInstance.apiPreviewEmbedCardTokenGet(token, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPreviewEmbedCardTokenQueryGet

> apiPreviewEmbedCardTokenQueryGet(token)

GET /api/preview_embed/card/{token}/query

Fetch the query results for a Card you&#39;re considering embedding by passing a JWT &#x60;token&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
apiInstance.apiPreviewEmbedCardTokenQueryGet(token, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPreviewEmbedDashboardTokenDashcardDashcardIdCardCardIdGet

> apiPreviewEmbedDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId)

GET /api/preview_embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results of running a Card belonging to a Dashboard you&#39;re considering embedding with JWT &#x60;token&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPreviewEmbedDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPreviewEmbedDashboardTokenGet

> apiPreviewEmbedDashboardTokenGet(token)

GET /api/preview_embed/dashboard/{token}

Fetch a Dashboard you&#39;re considering embedding by passing a JWT &#x60;token&#x60;. 

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
apiInstance.apiPreviewEmbedDashboardTokenGet(token, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPreviewEmbedDashboardTokenParamsParamKeyValuesGet

> apiPreviewEmbedDashboardTokenParamsParamKeyValuesGet()

GET /api/preview_embed/dashboard/{token}/params/{param-key}/values

Embedded version of chain filter values endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
apiInstance.apiPreviewEmbedDashboardTokenParamsParamKeyValuesGet((error, data, response) => {
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


## apiPreviewEmbedPivotCardTokenQueryGet

> apiPreviewEmbedPivotCardTokenQueryGet(token)

GET /api/preview_embed/pivot/card/{token}/query

Fetch the query results for a Card you&#39;re considering embedding by passing a JWT &#x60;token&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
apiInstance.apiPreviewEmbedPivotCardTokenQueryGet(token, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPreviewEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet

> apiPreviewEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId)

GET /api/preview_embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results of running a Card belonging to a Dashboard you&#39;re considering embedding with JWT &#x60;token&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPreviewEmbedApi();
let token = "token_example"; // String | value must be a non-blank string.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPreviewEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

