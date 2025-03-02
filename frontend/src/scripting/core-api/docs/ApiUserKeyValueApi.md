# MetabaseApi.ApiUserKeyValueApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiUserKeyValueNamespaceNamespaceGet**](ApiUserKeyValueApi.md#apiUserKeyValueNamespaceNamespaceGet) | **GET** /api/user-key-value/namespace/{namespace} | GET /api/user-key-value/namespace/{namespace}
[**apiUserKeyValueNamespaceNamespaceKeyKeyDelete**](ApiUserKeyValueApi.md#apiUserKeyValueNamespaceNamespaceKeyKeyDelete) | **DELETE** /api/user-key-value/namespace/{namespace}/key/{key} | DELETE /api/user-key-value/namespace/{namespace}/key/{key}
[**apiUserKeyValueNamespaceNamespaceKeyKeyGet**](ApiUserKeyValueApi.md#apiUserKeyValueNamespaceNamespaceKeyKeyGet) | **GET** /api/user-key-value/namespace/{namespace}/key/{key} | GET /api/user-key-value/namespace/{namespace}/key/{key}
[**apiUserKeyValueNamespaceNamespaceKeyKeyPut**](ApiUserKeyValueApi.md#apiUserKeyValueNamespaceNamespaceKeyKeyPut) | **PUT** /api/user-key-value/namespace/{namespace}/key/{key} | PUT /api/user-key-value/namespace/{namespace}/key/{key}



## apiUserKeyValueNamespaceNamespaceGet

> apiUserKeyValueNamespaceNamespaceGet(namespace)

GET /api/user-key-value/namespace/{namespace}

Returns all KV pairs in a given namespace for the current user

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserKeyValueApi();
let namespace = "namespace_example"; // String | value must be a non-blank string.
apiInstance.apiUserKeyValueNamespaceNamespaceGet(namespace, (error, data, response) => {
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
 **namespace** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiUserKeyValueNamespaceNamespaceKeyKeyDelete

> apiUserKeyValueNamespaceNamespaceKeyKeyDelete()

DELETE /api/user-key-value/namespace/{namespace}/key/{key}

Deletes a KV-pair for the user

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserKeyValueApi();
apiInstance.apiUserKeyValueNamespaceNamespaceKeyKeyDelete((error, data, response) => {
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


## apiUserKeyValueNamespaceNamespaceKeyKeyGet

> apiUserKeyValueNamespaceNamespaceKeyKeyGet(key, namespace)

GET /api/user-key-value/namespace/{namespace}/key/{key}

Get a value for the user

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserKeyValueApi();
let key = "key_example"; // String | value must be a non-blank string.
let namespace = "namespace_example"; // String | value must be a non-blank string.
apiInstance.apiUserKeyValueNamespaceNamespaceKeyKeyGet(key, namespace, (error, data, response) => {
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
 **key** | **String**| value must be a non-blank string. | 
 **namespace** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiUserKeyValueNamespaceNamespaceKeyKeyPut

> apiUserKeyValueNamespaceNamespaceKeyKeyPut(key, namespace, opts)

PUT /api/user-key-value/namespace/{namespace}/key/{key}

Upsert a KV-pair for the user

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserKeyValueApi();
let key = "key_example"; // String | value must be a non-blank string.
let namespace = "namespace_example"; // String | value must be a non-blank string.
let opts = {
  'apiUserKeyValueNamespaceNamespaceKeyKeyPutRequest': new MetabaseApi.ApiUserKeyValueNamespaceNamespaceKeyKeyPutRequest() // ApiUserKeyValueNamespaceNamespaceKeyKeyPutRequest | 
};
apiInstance.apiUserKeyValueNamespaceNamespaceKeyKeyPut(key, namespace, opts, (error, data, response) => {
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
 **key** | **String**| value must be a non-blank string. | 
 **namespace** | **String**| value must be a non-blank string. | 
 **apiUserKeyValueNamespaceNamespaceKeyKeyPutRequest** | [**ApiUserKeyValueNamespaceNamespaceKeyKeyPutRequest**](ApiUserKeyValueNamespaceNamespaceKeyKeyPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

