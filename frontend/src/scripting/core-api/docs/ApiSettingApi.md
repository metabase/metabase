# MetabaseApi.ApiSettingApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSettingGet**](ApiSettingApi.md#apiSettingGet) | **GET** /api/setting/ | GET /api/setting/
[**apiSettingKeyGet**](ApiSettingApi.md#apiSettingKeyGet) | **GET** /api/setting/{key} | GET /api/setting/{key}
[**apiSettingKeyPut**](ApiSettingApi.md#apiSettingKeyPut) | **PUT** /api/setting/{key} | PUT /api/setting/{key}
[**apiSettingPut**](ApiSettingApi.md#apiSettingPut) | **PUT** /api/setting/ | PUT /api/setting/



## apiSettingGet

> apiSettingGet()

GET /api/setting/

Get all &#x60;Settings&#x60; and their values. You must be a superuser or have &#x60;setting&#x60; permission to do this.   For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSettingApi();
apiInstance.apiSettingGet((error, data, response) => {
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


## apiSettingKeyGet

> apiSettingKeyGet(key)

GET /api/setting/{key}

Fetch a single &#x60;Setting&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSettingApi();
let key = "key_example"; // String | 
apiInstance.apiSettingKeyGet(key, (error, data, response) => {
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
 **key** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSettingKeyPut

> apiSettingKeyPut(key)

PUT /api/setting/{key}

Create/update a &#x60;Setting&#x60;. If called by a non-admin, only user-local settings can be updated.    This endpoint can also be used to delete Settings by passing &#x60;nil&#x60; for &#x60;:value&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSettingApi();
let key = "key_example"; // String | 
apiInstance.apiSettingKeyPut(key, (error, data, response) => {
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
 **key** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSettingPut

> apiSettingPut(opts)

PUT /api/setting/

Update multiple &#x60;Settings&#x60; values. If called by a non-superuser, only user-local settings can be updated.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSettingApi();
let opts = {
  'requestBody': {key: null} // {String: Object} | 
};
apiInstance.apiSettingPut(opts, (error, data, response) => {
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
 **requestBody** | [**{String: Object}**](Object.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

