# MetabaseApi.ApiEeScimApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeScimApiKeyGet**](ApiEeScimApi.md#apiEeScimApiKeyGet) | **GET** /api/ee/scim/api_key | GET /api/ee/scim/api_key
[**apiEeScimApiKeyPost**](ApiEeScimApi.md#apiEeScimApiKeyPost) | **POST** /api/ee/scim/api_key | POST /api/ee/scim/api_key



## apiEeScimApiKeyGet

> apiEeScimApiKeyGet()

GET /api/ee/scim/api_key

Fetch the SCIM API key if one exists. Does *not* return an unmasked key, since we don&#39;t have access   to that after it is created.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimApi();
apiInstance.apiEeScimApiKeyGet((error, data, response) => {
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


## apiEeScimApiKeyPost

> apiEeScimApiKeyPost()

POST /api/ee/scim/api_key

Create a new SCIM API key, or refresh one that already exists. When called for the first time,   this is equivalent to enabling SCIM.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimApi();
apiInstance.apiEeScimApiKeyPost((error, data, response) => {
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

