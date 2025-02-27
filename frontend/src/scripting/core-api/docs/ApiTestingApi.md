# MetabaseApi.ApiTestingApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTestingEchoGet**](ApiTestingApi.md#apiTestingEchoGet) | **GET** /api/testing/echo | GET /api/testing/echo
[**apiTestingEchoPost**](ApiTestingApi.md#apiTestingEchoPost) | **POST** /api/testing/echo | POST /api/testing/echo
[**apiTestingMarkStalePost**](ApiTestingApi.md#apiTestingMarkStalePost) | **POST** /api/testing/mark-stale | POST /api/testing/mark-stale
[**apiTestingRestoreNamePost**](ApiTestingApi.md#apiTestingRestoreNamePost) | **POST** /api/testing/restore/{name} | POST /api/testing/restore/{name}
[**apiTestingSetTimePost**](ApiTestingApi.md#apiTestingSetTimePost) | **POST** /api/testing/set-time | POST /api/testing/set-time
[**apiTestingSnapshotNamePost**](ApiTestingApi.md#apiTestingSnapshotNamePost) | **POST** /api/testing/snapshot/{name} | POST /api/testing/snapshot/{name}
[**apiTestingStatsPost**](ApiTestingApi.md#apiTestingStatsPost) | **POST** /api/testing/stats | POST /api/testing/stats



## apiTestingEchoGet

> apiTestingEchoGet(fail, body)

GET /api/testing/echo

Simple echo hander. Fails when you GET with &#x60;?fail&#x3D;true&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let fail = false; // Boolean | 
let body = "body_example"; // String | value must be a valid JSON string.
apiInstance.apiTestingEchoGet(fail, body, (error, data, response) => {
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
 **fail** | **Boolean**|  | [default to false]
 **body** | **String**| value must be a valid JSON string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTestingEchoPost

> apiTestingEchoPost(fail)

POST /api/testing/echo

Simple echo hander. Fails when you POST with &#x60;?fail&#x3D;true&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let fail = false; // Boolean | 
apiInstance.apiTestingEchoPost(fail, (error, data, response) => {
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
 **fail** | **Boolean**|  | [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTestingMarkStalePost

> apiTestingMarkStalePost(opts)

POST /api/testing/mark-stale

Mark the card or dashboard as stale

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let opts = {
  'apiTestingMarkStalePostRequest': new MetabaseApi.ApiTestingMarkStalePostRequest() // ApiTestingMarkStalePostRequest | 
};
apiInstance.apiTestingMarkStalePost(opts, (error, data, response) => {
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
 **apiTestingMarkStalePostRequest** | [**ApiTestingMarkStalePostRequest**](ApiTestingMarkStalePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTestingRestoreNamePost

> apiTestingRestoreNamePost(name)

POST /api/testing/restore/{name}

Restore a database snapshot for testing purposes.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let name = "name_example"; // String | value must be a non-blank string.
apiInstance.apiTestingRestoreNamePost(name, (error, data, response) => {
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
 **name** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTestingSetTimePost

> apiTestingSetTimePost(opts)

POST /api/testing/set-time

Make java-time see world at exact time.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let opts = {
  'apiTestingSetTimePostRequest': new MetabaseApi.ApiTestingSetTimePostRequest() // ApiTestingSetTimePostRequest | 
};
apiInstance.apiTestingSetTimePost(opts, (error, data, response) => {
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
 **apiTestingSetTimePostRequest** | [**ApiTestingSetTimePostRequest**](ApiTestingSetTimePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTestingSnapshotNamePost

> apiTestingSnapshotNamePost(name)

POST /api/testing/snapshot/{name}

Snapshot the database for testing purposes.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
let name = "name_example"; // String | value must be a non-blank string.
apiInstance.apiTestingSnapshotNamePost(name, (error, data, response) => {
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
 **name** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTestingStatsPost

> apiTestingStatsPost()

POST /api/testing/stats

Triggers a send of instance usage stats

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTestingApi();
apiInstance.apiTestingStatsPost((error, data, response) => {
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

