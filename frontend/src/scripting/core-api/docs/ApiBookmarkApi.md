# MetabaseApi.ApiBookmarkApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiBookmarkGet**](ApiBookmarkApi.md#apiBookmarkGet) | **GET** /api/bookmark/ | GET /api/bookmark/
[**apiBookmarkModelIdDelete**](ApiBookmarkApi.md#apiBookmarkModelIdDelete) | **DELETE** /api/bookmark/{model}/{id} | DELETE /api/bookmark/{model}/{id}
[**apiBookmarkModelIdPost**](ApiBookmarkApi.md#apiBookmarkModelIdPost) | **POST** /api/bookmark/{model}/{id} | POST /api/bookmark/{model}/{id}
[**apiBookmarkOrderingPut**](ApiBookmarkApi.md#apiBookmarkOrderingPut) | **PUT** /api/bookmark/ordering | PUT /api/bookmark/ordering



## apiBookmarkGet

> apiBookmarkGet()

GET /api/bookmark/

Fetch all bookmarks for the user

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiBookmarkApi();
apiInstance.apiBookmarkGet((error, data, response) => {
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


## apiBookmarkModelIdDelete

> apiBookmarkModelIdDelete(model, id)

DELETE /api/bookmark/{model}/{id}

Delete a bookmark. Will delete a bookmark assigned to the user making the request by model and id.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiBookmarkApi();
let model = "model_example"; // String | 
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiBookmarkModelIdDelete(model, id, (error, data, response) => {
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
 **model** | **String**|  | 
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiBookmarkModelIdPost

> apiBookmarkModelIdPost(model, id)

POST /api/bookmark/{model}/{id}

Create a new bookmark for user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiBookmarkApi();
let model = "model_example"; // String | 
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiBookmarkModelIdPost(model, id, (error, data, response) => {
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
 **model** | **String**|  | 
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiBookmarkOrderingPut

> apiBookmarkOrderingPut(opts)

PUT /api/bookmark/ordering

Sets the order of bookmarks for user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiBookmarkApi();
let opts = {
  'apiBookmarkOrderingPutRequest': new MetabaseApi.ApiBookmarkOrderingPutRequest() // ApiBookmarkOrderingPutRequest | 
};
apiInstance.apiBookmarkOrderingPut(opts, (error, data, response) => {
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
 **apiBookmarkOrderingPutRequest** | [**ApiBookmarkOrderingPutRequest**](ApiBookmarkOrderingPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

