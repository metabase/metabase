# MetabaseApi.ApiPulseUnsubscribeApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPulseUnsubscribePost**](ApiPulseUnsubscribeApi.md#apiPulseUnsubscribePost) | **POST** /api/pulse/unsubscribe/ | POST /api/pulse/unsubscribe/
[**apiPulseUnsubscribeUndoPost**](ApiPulseUnsubscribeApi.md#apiPulseUnsubscribeUndoPost) | **POST** /api/pulse/unsubscribe/undo | POST /api/pulse/unsubscribe/undo



## apiPulseUnsubscribePost

> apiPulseUnsubscribePost(opts)

POST /api/pulse/unsubscribe/

Allow non-users to unsubscribe from pulses/subscriptions, with the hash given through email.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseUnsubscribeApi();
let opts = {
  'apiPulseUnsubscribePostRequest': new MetabaseApi.ApiPulseUnsubscribePostRequest() // ApiPulseUnsubscribePostRequest | 
};
apiInstance.apiPulseUnsubscribePost(opts, (error, data, response) => {
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
 **apiPulseUnsubscribePostRequest** | [**ApiPulseUnsubscribePostRequest**](ApiPulseUnsubscribePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPulseUnsubscribeUndoPost

> apiPulseUnsubscribeUndoPost(opts)

POST /api/pulse/unsubscribe/undo

Allow non-users to undo an unsubscribe from pulses/subscriptions, with the hash given through email.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseUnsubscribeApi();
let opts = {
  'apiPulseUnsubscribeUndoPostRequest': new MetabaseApi.ApiPulseUnsubscribeUndoPostRequest() // ApiPulseUnsubscribeUndoPostRequest | 
};
apiInstance.apiPulseUnsubscribeUndoPost(opts, (error, data, response) => {
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
 **apiPulseUnsubscribeUndoPostRequest** | [**ApiPulseUnsubscribeUndoPostRequest**](ApiPulseUnsubscribeUndoPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

