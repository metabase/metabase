# MetabaseApi.ApiNativeQuerySnippetApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiNativeQuerySnippetGet**](ApiNativeQuerySnippetApi.md#apiNativeQuerySnippetGet) | **GET** /api/native-query-snippet/ | GET /api/native-query-snippet/
[**apiNativeQuerySnippetIdGet**](ApiNativeQuerySnippetApi.md#apiNativeQuerySnippetIdGet) | **GET** /api/native-query-snippet/{id} | GET /api/native-query-snippet/{id}
[**apiNativeQuerySnippetIdPut**](ApiNativeQuerySnippetApi.md#apiNativeQuerySnippetIdPut) | **PUT** /api/native-query-snippet/{id} | PUT /api/native-query-snippet/{id}
[**apiNativeQuerySnippetPost**](ApiNativeQuerySnippetApi.md#apiNativeQuerySnippetPost) | **POST** /api/native-query-snippet/ | POST /api/native-query-snippet/



## apiNativeQuerySnippetGet

> apiNativeQuerySnippetGet(opts)

GET /api/native-query-snippet/

Fetch all snippets

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNativeQuerySnippetApi();
let opts = {
  'archived': false // Boolean | 
};
apiInstance.apiNativeQuerySnippetGet(opts, (error, data, response) => {
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
 **archived** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiNativeQuerySnippetIdGet

> apiNativeQuerySnippetIdGet(id)

GET /api/native-query-snippet/{id}

Fetch native query snippet with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNativeQuerySnippetApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiNativeQuerySnippetIdGet(id, (error, data, response) => {
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


## apiNativeQuerySnippetIdPut

> apiNativeQuerySnippetIdPut(id, opts)

PUT /api/native-query-snippet/{id}

Update an existing &#x60;NativeQuerySnippet&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNativeQuerySnippetApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiNativeQuerySnippetIdPutRequest': new MetabaseApi.ApiNativeQuerySnippetIdPutRequest() // ApiNativeQuerySnippetIdPutRequest | 
};
apiInstance.apiNativeQuerySnippetIdPut(id, opts, (error, data, response) => {
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
 **apiNativeQuerySnippetIdPutRequest** | [**ApiNativeQuerySnippetIdPutRequest**](ApiNativeQuerySnippetIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiNativeQuerySnippetPost

> apiNativeQuerySnippetPost(opts)

POST /api/native-query-snippet/

Create a new &#x60;NativeQuerySnippet&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNativeQuerySnippetApi();
let opts = {
  'apiNativeQuerySnippetPostRequest': new MetabaseApi.ApiNativeQuerySnippetPostRequest() // ApiNativeQuerySnippetPostRequest | 
};
apiInstance.apiNativeQuerySnippetPost(opts, (error, data, response) => {
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
 **apiNativeQuerySnippetPostRequest** | [**ApiNativeQuerySnippetPostRequest**](ApiNativeQuerySnippetPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

