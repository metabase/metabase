# MetabaseApi.ApiSetupApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSetupAdminChecklistGet**](ApiSetupApi.md#apiSetupAdminChecklistGet) | **GET** /api/setup/admin_checklist | GET /api/setup/admin_checklist
[**apiSetupPost**](ApiSetupApi.md#apiSetupPost) | **POST** /api/setup/ | POST /api/setup/
[**apiSetupUserDefaultsGet**](ApiSetupApi.md#apiSetupUserDefaultsGet) | **GET** /api/setup/user_defaults | GET /api/setup/user_defaults



## apiSetupAdminChecklistGet

> apiSetupAdminChecklistGet()

GET /api/setup/admin_checklist

Return various \&quot;admin checklist\&quot; steps and whether they&#39;ve been completed. You must be a superuser to see this!

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSetupApi();
apiInstance.apiSetupAdminChecklistGet((error, data, response) => {
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


## apiSetupPost

> apiSetupPost(opts)

POST /api/setup/

Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and   returns a session ID. This endpoint can also be used to add a database, create and invite a second admin, and/or   set specific settings from the setup flow.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSetupApi();
let opts = {
  'apiSetupPostRequest': new MetabaseApi.ApiSetupPostRequest() // ApiSetupPostRequest | 
};
apiInstance.apiSetupPost(opts, (error, data, response) => {
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
 **apiSetupPostRequest** | [**ApiSetupPostRequest**](ApiSetupPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSetupUserDefaultsGet

> apiSetupUserDefaultsGet()

GET /api/setup/user_defaults

Returns object containing default user details for initial setup, if configured,    and if the provided token value matches the token in the configuration value.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSetupApi();
apiInstance.apiSetupUserDefaultsGet((error, data, response) => {
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

