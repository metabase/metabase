# MetabaseApi.ApiEmailApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEmailDelete**](ApiEmailApi.md#apiEmailDelete) | **DELETE** /api/email/ | DELETE /api/email/
[**apiEmailPut**](ApiEmailApi.md#apiEmailPut) | **PUT** /api/email/ | PUT /api/email/
[**apiEmailTestPost**](ApiEmailApi.md#apiEmailTestPost) | **POST** /api/email/test | POST /api/email/test



## apiEmailDelete

> apiEmailDelete()

DELETE /api/email/

Clear all email related settings. You must be a superuser or have &#x60;setting&#x60; permission to do this.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmailApi();
apiInstance.apiEmailDelete((error, data, response) => {
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


## apiEmailPut

> apiEmailPut(opts)

PUT /api/email/

Update multiple email Settings. You must be a superuser or have &#x60;setting&#x60; permission to do this.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmailApi();
let opts = {
  'body': {key: null} // Object | 
};
apiInstance.apiEmailPut(opts, (error, data, response) => {
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
 **body** | **Object**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEmailTestPost

> apiEmailTestPost()

POST /api/email/test

Send a test email using the SMTP Settings. You must be a superuser or have &#x60;setting&#x60; permission to do this.   Returns &#x60;{:ok true}&#x60; if we were able to send the message successfully, otherwise a standard 400 error response.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmailApi();
apiInstance.apiEmailTestPost((error, data, response) => {
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

