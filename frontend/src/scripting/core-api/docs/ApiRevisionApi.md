# MetabaseApi.ApiRevisionApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiRevisionEntityIdGet**](ApiRevisionApi.md#apiRevisionEntityIdGet) | **GET** /api/revision/{entity}/{id} | GET /api/revision/{entity}/{id}
[**apiRevisionGet**](ApiRevisionApi.md#apiRevisionGet) | **GET** /api/revision/ | GET /api/revision/
[**apiRevisionRevertPost**](ApiRevisionApi.md#apiRevisionRevertPost) | **POST** /api/revision/revert | POST /api/revision/revert



## apiRevisionEntityIdGet

> apiRevisionEntityIdGet(entity, id)

GET /api/revision/{entity}/{id}

Fetch &#x60;Revisions&#x60; for an object with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiRevisionApi();
let entity = "entity_example"; // String | 
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiRevisionEntityIdGet(entity, id, (error, data, response) => {
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
 **entity** | **String**|  | 
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiRevisionGet

> apiRevisionGet(id, entity)

GET /api/revision/

Get revisions of an object.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiRevisionApi();
let id = 56; // Number | value must be an integer greater than zero.
let entity = "entity_example"; // String | 
apiInstance.apiRevisionGet(id, entity, (error, data, response) => {
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
 **entity** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiRevisionRevertPost

> apiRevisionRevertPost(opts)

POST /api/revision/revert

Revert an object to a prior revision.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiRevisionApi();
let opts = {
  'apiRevisionRevertPostRequest': new MetabaseApi.ApiRevisionRevertPostRequest() // ApiRevisionRevertPostRequest | 
};
apiInstance.apiRevisionRevertPost(opts, (error, data, response) => {
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
 **apiRevisionRevertPostRequest** | [**ApiRevisionRevertPostRequest**](ApiRevisionRevertPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

