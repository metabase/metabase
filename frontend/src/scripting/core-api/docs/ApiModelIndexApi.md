# MetabaseApi.ApiModelIndexApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiModelIndexGet**](ApiModelIndexApi.md#apiModelIndexGet) | **GET** /api/model-index/ | GET /api/model-index/
[**apiModelIndexIdDelete**](ApiModelIndexApi.md#apiModelIndexIdDelete) | **DELETE** /api/model-index/{id} | DELETE /api/model-index/{id}
[**apiModelIndexIdGet**](ApiModelIndexApi.md#apiModelIndexIdGet) | **GET** /api/model-index/{id} | GET /api/model-index/{id}
[**apiModelIndexPost**](ApiModelIndexApi.md#apiModelIndexPost) | **POST** /api/model-index/ | POST /api/model-index/



## apiModelIndexGet

> apiModelIndexGet(modelId)

GET /api/model-index/

Retrieve list of ModelIndex.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiModelIndexApi();
let modelId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiModelIndexGet(modelId, (error, data, response) => {
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
 **modelId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiModelIndexIdDelete

> apiModelIndexIdDelete(id)

DELETE /api/model-index/{id}

Delete ModelIndex.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiModelIndexApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiModelIndexIdDelete(id, (error, data, response) => {
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


## apiModelIndexIdGet

> apiModelIndexIdGet(id)

GET /api/model-index/{id}

Retrieve ModelIndex.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiModelIndexApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiModelIndexIdGet(id, (error, data, response) => {
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


## apiModelIndexPost

> apiModelIndexPost(opts)

POST /api/model-index/

Create ModelIndex.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiModelIndexApi();
let opts = {
  'apiModelIndexPostRequest': new MetabaseApi.ApiModelIndexPostRequest() // ApiModelIndexPostRequest | 
};
apiInstance.apiModelIndexPost(opts, (error, data, response) => {
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
 **apiModelIndexPostRequest** | [**ApiModelIndexPostRequest**](ApiModelIndexPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

