# MetabaseApi.ApiAlertApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiAlertGet**](ApiAlertApi.md#apiAlertGet) | **GET** /api/alert/ | GET /api/alert/
[**apiAlertIdGet**](ApiAlertApi.md#apiAlertIdGet) | **GET** /api/alert/{id} | GET /api/alert/{id}
[**apiAlertIdPut**](ApiAlertApi.md#apiAlertIdPut) | **PUT** /api/alert/{id} | PUT /api/alert/{id}
[**apiAlertIdSubscriptionDelete**](ApiAlertApi.md#apiAlertIdSubscriptionDelete) | **DELETE** /api/alert/{id}/subscription | DELETE /api/alert/{id}/subscription
[**apiAlertPost**](ApiAlertApi.md#apiAlertPost) | **POST** /api/alert/ | POST /api/alert/
[**apiAlertQuestionIdGet**](ApiAlertApi.md#apiAlertQuestionIdGet) | **GET** /api/alert/question/{id} | GET /api/alert/question/{id}



## apiAlertGet

> apiAlertGet(opts)

GET /api/alert/

Fetch alerts which the current user has created or will receive, or all alerts if the user is an admin.   The optional &#x60;user_id&#x60; will return alerts created by the corresponding user, but is ignored for non-admin users.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let opts = {
  'archived': false, // Boolean | 
  'userId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiAlertGet(opts, (error, data, response) => {
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
 **archived** | **Boolean**|  | [optional] [default to false]
 **userId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAlertIdGet

> apiAlertIdGet(id)

GET /api/alert/{id}

Fetch an alert by ID

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiAlertIdGet(id, (error, data, response) => {
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

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAlertIdPut

> apiAlertIdPut(id, opts)

PUT /api/alert/{id}

Update a &#x60;Alert&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiAlertIdPutRequest': new MetabaseApi.ApiAlertIdPutRequest() // ApiAlertIdPutRequest | 
};
apiInstance.apiAlertIdPut(id, opts, (error, data, response) => {
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
 **apiAlertIdPutRequest** | [**ApiAlertIdPutRequest**](ApiAlertIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiAlertIdSubscriptionDelete

> apiAlertIdSubscriptionDelete(id)

DELETE /api/alert/{id}/subscription

For users to unsubscribe themselves from the given alert.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiAlertIdSubscriptionDelete(id, (error, data, response) => {
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

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAlertPost

> apiAlertPost(opts)

POST /api/alert/

Create a new Alert.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let opts = {
  'apiAlertPostRequest': new MetabaseApi.ApiAlertPostRequest() // ApiAlertPostRequest | 
};
apiInstance.apiAlertPost(opts, (error, data, response) => {
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
 **apiAlertPostRequest** | [**ApiAlertPostRequest**](ApiAlertPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiAlertQuestionIdGet

> apiAlertQuestionIdGet(id, opts)

GET /api/alert/question/{id}

Fetch all alerts for the given question (&#x60;Card&#x60;) id

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAlertApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'archived': false // Boolean | 
};
apiInstance.apiAlertQuestionIdGet(id, opts, (error, data, response) => {
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
 **archived** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

