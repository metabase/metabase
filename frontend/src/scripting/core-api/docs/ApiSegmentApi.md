# MetabaseApi.ApiSegmentApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSegmentGet**](ApiSegmentApi.md#apiSegmentGet) | **GET** /api/segment/ | GET /api/segment/
[**apiSegmentIdDelete**](ApiSegmentApi.md#apiSegmentIdDelete) | **DELETE** /api/segment/{id} | DELETE /api/segment/{id}
[**apiSegmentIdGet**](ApiSegmentApi.md#apiSegmentIdGet) | **GET** /api/segment/{id} | GET /api/segment/{id}
[**apiSegmentIdPut**](ApiSegmentApi.md#apiSegmentIdPut) | **PUT** /api/segment/{id} | PUT /api/segment/{id}
[**apiSegmentIdRelatedGet**](ApiSegmentApi.md#apiSegmentIdRelatedGet) | **GET** /api/segment/{id}/related | GET /api/segment/{id}/related
[**apiSegmentPost**](ApiSegmentApi.md#apiSegmentPost) | **POST** /api/segment/ | POST /api/segment/



## apiSegmentGet

> apiSegmentGet()

GET /api/segment/

Fetch *all* &#x60;Segments&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
apiInstance.apiSegmentGet((error, data, response) => {
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


## apiSegmentIdDelete

> apiSegmentIdDelete(id, revisionMessage)

DELETE /api/segment/{id}

Archive a Segment. (DEPRECATED -- Just pass updated value of &#x60;:archived&#x60; to the &#x60;PUT&#x60; endpoint instead.)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
let id = 56; // Number | value must be an integer greater than zero.
let revisionMessage = "revisionMessage_example"; // String | value must be a non-blank string.
apiInstance.apiSegmentIdDelete(id, revisionMessage, (error, data, response) => {
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
 **revisionMessage** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSegmentIdGet

> apiSegmentIdGet(id)

GET /api/segment/{id}

Fetch &#x60;Segment&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiSegmentIdGet(id, (error, data, response) => {
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


## apiSegmentIdPut

> apiSegmentIdPut(id, opts)

PUT /api/segment/{id}

Update a &#x60;Segment&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiSegmentIdPutRequest': new MetabaseApi.ApiSegmentIdPutRequest() // ApiSegmentIdPutRequest | 
};
apiInstance.apiSegmentIdPut(id, opts, (error, data, response) => {
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
 **apiSegmentIdPutRequest** | [**ApiSegmentIdPutRequest**](ApiSegmentIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSegmentIdRelatedGet

> apiSegmentIdRelatedGet(id)

GET /api/segment/{id}/related

Return related entities.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiSegmentIdRelatedGet(id, (error, data, response) => {
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


## apiSegmentPost

> apiSegmentPost(opts)

POST /api/segment/

Create a new &#x60;Segment&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSegmentApi();
let opts = {
  'apiSegmentPostRequest': new MetabaseApi.ApiSegmentPostRequest() // ApiSegmentPostRequest | 
};
apiInstance.apiSegmentPost(opts, (error, data, response) => {
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
 **apiSegmentPostRequest** | [**ApiSegmentPostRequest**](ApiSegmentPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

