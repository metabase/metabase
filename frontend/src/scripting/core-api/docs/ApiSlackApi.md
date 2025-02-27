# MetabaseApi.ApiSlackApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSlackBugReportPost**](ApiSlackApi.md#apiSlackBugReportPost) | **POST** /api/slack/bug-report | POST /api/slack/bug-report
[**apiSlackManifestGet**](ApiSlackApi.md#apiSlackManifestGet) | **GET** /api/slack/manifest | GET /api/slack/manifest
[**apiSlackSettingsPut**](ApiSlackApi.md#apiSlackSettingsPut) | **PUT** /api/slack/settings | PUT /api/slack/settings



## apiSlackBugReportPost

> apiSlackBugReportPost(opts)

POST /api/slack/bug-report

Send diagnostic information to the configured Slack channels.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSlackApi();
let opts = {
  'apiSlackBugReportPostRequest': new MetabaseApi.ApiSlackBugReportPostRequest() // ApiSlackBugReportPostRequest | 
};
apiInstance.apiSlackBugReportPost(opts, (error, data, response) => {
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
 **apiSlackBugReportPostRequest** | [**ApiSlackBugReportPostRequest**](ApiSlackBugReportPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSlackManifestGet

> apiSlackManifestGet()

GET /api/slack/manifest

Returns the YAML manifest file that should be used to bootstrap new Slack apps

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSlackApi();
apiInstance.apiSlackManifestGet((error, data, response) => {
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


## apiSlackSettingsPut

> apiSlackSettingsPut(opts)

PUT /api/slack/settings

Update Slack related settings. You must be a superuser to do this. Also updates the slack-cache.   There are 3 cases where we alter the slack channel/user cache:   1. falsy token           -&gt; clear   2. invalid token         -&gt; clear   3. truthy, valid token   -&gt; refresh 

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSlackApi();
let opts = {
  'apiSlackSettingsPutRequest': new MetabaseApi.ApiSlackSettingsPutRequest() // ApiSlackSettingsPutRequest | 
};
apiInstance.apiSlackSettingsPut(opts, (error, data, response) => {
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
 **apiSlackSettingsPutRequest** | [**ApiSlackSettingsPutRequest**](ApiSlackSettingsPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

