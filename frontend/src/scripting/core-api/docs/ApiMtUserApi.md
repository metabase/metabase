# MetabaseApi.ApiMtUserApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiMtUserAttributesGet**](ApiMtUserApi.md#apiMtUserAttributesGet) | **GET** /api/mt/user/attributes | GET /api/mt/user/attributes
[**apiMtUserIdAttributesPut**](ApiMtUserApi.md#apiMtUserIdAttributesPut) | **PUT** /api/mt/user/{id}/attributes | PUT /api/mt/user/{id}/attributes



## apiMtUserAttributesGet

> apiMtUserAttributesGet()

GET /api/mt/user/attributes

Fetch a list of possible keys for User &#x60;login_attributes&#x60;. This just looks at keys that have already been set for   existing Users and returns those. 

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtUserApi();
apiInstance.apiMtUserAttributesGet((error, data, response) => {
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


## apiMtUserIdAttributesPut

> apiMtUserIdAttributesPut(id, opts)

PUT /api/mt/user/{id}/attributes

Update the &#x60;login_attributes&#x60; for a User.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtUserApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiMtUserIdAttributesPutRequest': new MetabaseApi.ApiMtUserIdAttributesPutRequest() // ApiMtUserIdAttributesPutRequest | 
};
apiInstance.apiMtUserIdAttributesPut(id, opts, (error, data, response) => {
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
 **apiMtUserIdAttributesPutRequest** | [**ApiMtUserIdAttributesPutRequest**](ApiMtUserIdAttributesPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

