# MetabaseApi.ApiTaskApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTaskGet**](ApiTaskApi.md#apiTaskGet) | **GET** /api/task/ | GET /api/task/
[**apiTaskIdGet**](ApiTaskApi.md#apiTaskIdGet) | **GET** /api/task/{id} | GET /api/task/{id}
[**apiTaskInfoGet**](ApiTaskApi.md#apiTaskInfoGet) | **GET** /api/task/info | GET /api/task/info



## apiTaskGet

> apiTaskGet()

GET /api/task/

Fetch a list of recent tasks stored as Task History

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTaskApi();
apiInstance.apiTaskGet((error, data, response) => {
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


## apiTaskIdGet

> apiTaskIdGet(id)

GET /api/task/{id}

Get &#x60;TaskHistory&#x60; entry with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTaskApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTaskIdGet(id, (error, data, response) => {
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


## apiTaskInfoGet

> apiTaskInfoGet()

GET /api/task/info

Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers).

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTaskApi();
apiInstance.apiTaskInfoGet((error, data, response) => {
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

