# MetabaseApi.ApiApiKeyApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiApiKeyCountGet**](ApiApiKeyApi.md#apiApiKeyCountGet) | **GET** /api/api-key/count | GET /api/api-key/count
[**apiApiKeyGet**](ApiApiKeyApi.md#apiApiKeyGet) | **GET** /api/api-key/ | GET /api/api-key/
[**apiApiKeyIdDelete**](ApiApiKeyApi.md#apiApiKeyIdDelete) | **DELETE** /api/api-key/{id} | DELETE /api/api-key/{id}
[**apiApiKeyIdPut**](ApiApiKeyApi.md#apiApiKeyIdPut) | **PUT** /api/api-key/{id} | PUT /api/api-key/{id}
[**apiApiKeyIdRegeneratePut**](ApiApiKeyApi.md#apiApiKeyIdRegeneratePut) | **PUT** /api/api-key/{id}/regenerate | PUT /api/api-key/{id}/regenerate
[**apiApiKeyPost**](ApiApiKeyApi.md#apiApiKeyPost) | **POST** /api/api-key/ | POST /api/api-key/



## apiApiKeyCountGet

> apiApiKeyCountGet()

GET /api/api-key/count

Get the count of API keys in the DB with the default scope.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
apiInstance.apiApiKeyCountGet((error, data, response) => {
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


## apiApiKeyGet

> apiApiKeyGet()

GET /api/api-key/

Get a list of API keys with the default scope. Non-paginated.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
apiInstance.apiApiKeyGet((error, data, response) => {
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


## apiApiKeyIdDelete

> apiApiKeyIdDelete(id)

DELETE /api/api-key/{id}

Delete an ApiKey

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiApiKeyIdDelete(id, (error, data, response) => {
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


## apiApiKeyIdPut

> apiApiKeyIdPut(id, opts)

PUT /api/api-key/{id}

Update an API key by changing its group and/or its name

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiApiKeyIdPutRequest': new MetabaseApi.ApiApiKeyIdPutRequest() // ApiApiKeyIdPutRequest | 
};
apiInstance.apiApiKeyIdPut(id, opts, (error, data, response) => {
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
 **apiApiKeyIdPutRequest** | [**ApiApiKeyIdPutRequest**](ApiApiKeyIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiApiKeyIdRegeneratePut

> apiApiKeyIdRegeneratePut(id)

PUT /api/api-key/{id}/regenerate

Regenerate an API Key

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiApiKeyIdRegeneratePut(id, (error, data, response) => {
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


## apiApiKeyPost

> apiApiKeyPost(opts)

POST /api/api-key/

Create a new API key (and an associated &#x60;User&#x60;) with the provided name and group ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiApiKeyApi();
let opts = {
  'apiApiKeyPostRequest': new MetabaseApi.ApiApiKeyPostRequest() // ApiApiKeyPostRequest | 
};
apiInstance.apiApiKeyPost(opts, (error, data, response) => {
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
 **apiApiKeyPostRequest** | [**ApiApiKeyPostRequest**](ApiApiKeyPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

