# MetabaseApi.ApiChannelApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiChannelGet**](ApiChannelApi.md#apiChannelGet) | **GET** /api/channel/ | GET /api/channel/
[**apiChannelIdGet**](ApiChannelApi.md#apiChannelIdGet) | **GET** /api/channel/{id} | GET /api/channel/{id}
[**apiChannelIdPut**](ApiChannelApi.md#apiChannelIdPut) | **PUT** /api/channel/{id} | PUT /api/channel/{id}
[**apiChannelPost**](ApiChannelApi.md#apiChannelPost) | **POST** /api/channel/ | POST /api/channel/
[**apiChannelTestPost**](ApiChannelApi.md#apiChannelTestPost) | **POST** /api/channel/test | POST /api/channel/test



## apiChannelGet

> apiChannelGet(opts)

GET /api/channel/

Get all channels

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiChannelApi();
let opts = {
  'apiChannelGetRequest': new MetabaseApi.ApiChannelGetRequest() // ApiChannelGetRequest | 
};
apiInstance.apiChannelGet(opts, (error, data, response) => {
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
 **apiChannelGetRequest** | [**ApiChannelGetRequest**](ApiChannelGetRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiChannelIdGet

> apiChannelIdGet(id)

GET /api/channel/{id}

Get a channel

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiChannelApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiChannelIdGet(id, (error, data, response) => {
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


## apiChannelIdPut

> apiChannelIdPut(id, opts)

PUT /api/channel/{id}

Update a channel

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiChannelApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiChannelIdPutRequest': new MetabaseApi.ApiChannelIdPutRequest() // ApiChannelIdPutRequest | 
};
apiInstance.apiChannelIdPut(id, opts, (error, data, response) => {
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
 **apiChannelIdPutRequest** | [**ApiChannelIdPutRequest**](ApiChannelIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiChannelPost

> apiChannelPost(opts)

POST /api/channel/

Create a channel

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiChannelApi();
let opts = {
  'apiChannelPostRequest': new MetabaseApi.ApiChannelPostRequest() // ApiChannelPostRequest | 
};
apiInstance.apiChannelPost(opts, (error, data, response) => {
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
 **apiChannelPostRequest** | [**ApiChannelPostRequest**](ApiChannelPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiChannelTestPost

> apiChannelTestPost(opts)

POST /api/channel/test

Test a channel connection

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiChannelApi();
let opts = {
  'apiChannelTestPostRequest': new MetabaseApi.ApiChannelTestPostRequest() // ApiChannelTestPostRequest | 
};
apiInstance.apiChannelTestPost(opts, (error, data, response) => {
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
 **apiChannelTestPostRequest** | [**ApiChannelTestPostRequest**](ApiChannelTestPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

