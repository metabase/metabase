# MetabaseApi.ApiSessionApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiSessionDelete**](ApiSessionApi.md#apiSessionDelete) | **DELETE** /api/session/ | DELETE /api/session/
[**apiSessionForgotPasswordPost**](ApiSessionApi.md#apiSessionForgotPasswordPost) | **POST** /api/session/forgot_password | POST /api/session/forgot_password
[**apiSessionGoogleAuthPost**](ApiSessionApi.md#apiSessionGoogleAuthPost) | **POST** /api/session/google_auth | POST /api/session/google_auth
[**apiSessionPasswordResetTokenValidGet**](ApiSessionApi.md#apiSessionPasswordResetTokenValidGet) | **GET** /api/session/password_reset_token_valid | GET /api/session/password_reset_token_valid
[**apiSessionPost**](ApiSessionApi.md#apiSessionPost) | **POST** /api/session/ | POST /api/session/
[**apiSessionPropertiesGet**](ApiSessionApi.md#apiSessionPropertiesGet) | **GET** /api/session/properties | GET /api/session/properties
[**apiSessionResetPasswordPost**](ApiSessionApi.md#apiSessionResetPasswordPost) | **POST** /api/session/reset_password | POST /api/session/reset_password



## apiSessionDelete

> apiSessionDelete()

DELETE /api/session/

Logout.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
apiInstance.apiSessionDelete((error, data, response) => {
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


## apiSessionForgotPasswordPost

> apiSessionForgotPasswordPost(opts)

POST /api/session/forgot_password

Send a reset email when user has forgotten their password.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
let opts = {
  'apiSessionForgotPasswordPostRequest': new MetabaseApi.ApiSessionForgotPasswordPostRequest() // ApiSessionForgotPasswordPostRequest | 
};
apiInstance.apiSessionForgotPasswordPost(opts, (error, data, response) => {
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
 **apiSessionForgotPasswordPostRequest** | [**ApiSessionForgotPasswordPostRequest**](ApiSessionForgotPasswordPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSessionGoogleAuthPost

> apiSessionGoogleAuthPost(opts)

POST /api/session/google_auth

Login with Google Auth.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
let opts = {
  'apiSessionGoogleAuthPostRequest': new MetabaseApi.ApiSessionGoogleAuthPostRequest() // ApiSessionGoogleAuthPostRequest | 
};
apiInstance.apiSessionGoogleAuthPost(opts, (error, data, response) => {
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
 **apiSessionGoogleAuthPostRequest** | [**ApiSessionGoogleAuthPostRequest**](ApiSessionGoogleAuthPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSessionPasswordResetTokenValidGet

> apiSessionPasswordResetTokenValidGet(token)

GET /api/session/password_reset_token_valid

Check if a password reset token is valid and isn&#39;t expired.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
let token = "token_example"; // String | value must be a non-blank string.
apiInstance.apiSessionPasswordResetTokenValidGet(token, (error, data, response) => {
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
 **token** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiSessionPost

> apiSessionPost(opts)

POST /api/session/

Login.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
let opts = {
  'apiSessionPostRequest': new MetabaseApi.ApiSessionPostRequest() // ApiSessionPostRequest | 
};
apiInstance.apiSessionPost(opts, (error, data, response) => {
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
 **apiSessionPostRequest** | [**ApiSessionPostRequest**](ApiSessionPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiSessionPropertiesGet

> apiSessionPropertiesGet()

GET /api/session/properties

Get all properties and their values. These are the specific &#x60;Settings&#x60; that are readable by the current user, or are   public if no user is logged in.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
apiInstance.apiSessionPropertiesGet((error, data, response) => {
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


## apiSessionResetPasswordPost

> apiSessionResetPasswordPost(opts)

POST /api/session/reset_password

Reset password with a reset token.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiSessionApi();
let opts = {
  'apiSessionResetPasswordPostRequest': new MetabaseApi.ApiSessionResetPasswordPostRequest() // ApiSessionResetPasswordPostRequest | 
};
apiInstance.apiSessionResetPasswordPost(opts, (error, data, response) => {
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
 **apiSessionResetPasswordPostRequest** | [**ApiSessionResetPasswordPostRequest**](ApiSessionResetPasswordPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

