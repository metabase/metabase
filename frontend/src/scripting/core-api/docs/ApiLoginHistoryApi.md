# MetabaseApi.ApiLoginHistoryApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiLoginHistoryCurrentGet**](ApiLoginHistoryApi.md#apiLoginHistoryCurrentGet) | **GET** /api/login-history/current | GET /api/login-history/current



## apiLoginHistoryCurrentGet

> apiLoginHistoryCurrentGet()

GET /api/login-history/current

Fetch recent logins for the current user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiLoginHistoryApi();
apiInstance.apiLoginHistoryCurrentGet((error, data, response) => {
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

