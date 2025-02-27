# MetabaseApi.ApiEeLogsApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeLogsQueryExecutionYyyyMmGet**](ApiEeLogsApi.md#apiEeLogsQueryExecutionYyyyMmGet) | **GET** /api/ee/logs/query_execution/{yyyy-mm} | GET /api/ee/logs/query_execution/{yyyy-mm}



## apiEeLogsQueryExecutionYyyyMmGet

> apiEeLogsQueryExecutionYyyyMmGet(yyyyMm)

GET /api/ee/logs/query_execution/{yyyy-mm}

Fetch rows for the month specified by &#x60;:yyyy-mm&#x60; from the query_execution logs table.   Must be a superuser.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeLogsApi();
let yyyyMm = "yyyyMm_example"; // String | Must be a string like 2020-04 or 2222-11.
apiInstance.apiEeLogsQueryExecutionYyyyMmGet(yyyyMm, (error, data, response) => {
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
 **yyyyMm** | **String**| Must be a string like 2020-04 or 2222-11. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

