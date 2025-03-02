# MetabaseApi.ApiGoogleApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiGoogleSettingsPut**](ApiGoogleApi.md#apiGoogleSettingsPut) | **PUT** /api/google/settings | PUT /api/google/settings



## apiGoogleSettingsPut

> apiGoogleSettingsPut(opts)

PUT /api/google/settings

Update Google Sign-In related settings. You must be a superuser to do this.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiGoogleApi();
let opts = {
  'apiGoogleSettingsPutRequest': new MetabaseApi.ApiGoogleSettingsPutRequest() // ApiGoogleSettingsPutRequest | 
};
apiInstance.apiGoogleSettingsPut(opts, (error, data, response) => {
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
 **apiGoogleSettingsPutRequest** | [**ApiGoogleSettingsPutRequest**](ApiGoogleSettingsPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

