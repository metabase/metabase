# MetabaseApi.ApiEeAutodescribeApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeAutodescribeCardSummarizePost**](ApiEeAutodescribeApi.md#apiEeAutodescribeCardSummarizePost) | **POST** /api/ee/autodescribe/card/summarize | POST /api/ee/autodescribe/card/summarize
[**apiEeAutodescribeDashboardSummarizeIdPost**](ApiEeAutodescribeApi.md#apiEeAutodescribeDashboardSummarizeIdPost) | **POST** /api/ee/autodescribe/dashboard/summarize/{id} | POST /api/ee/autodescribe/dashboard/summarize/{id}



## apiEeAutodescribeCardSummarizePost

> apiEeAutodescribeCardSummarizePost(opts)

POST /api/ee/autodescribe/card/summarize

Summarize a question.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAutodescribeApi();
let opts = {
  'apiEeAutodescribeCardSummarizePostRequest': new MetabaseApi.ApiEeAutodescribeCardSummarizePostRequest() // ApiEeAutodescribeCardSummarizePostRequest | 
};
apiInstance.apiEeAutodescribeCardSummarizePost(opts, (error, data, response) => {
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
 **apiEeAutodescribeCardSummarizePostRequest** | [**ApiEeAutodescribeCardSummarizePostRequest**](ApiEeAutodescribeCardSummarizePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEeAutodescribeDashboardSummarizeIdPost

> apiEeAutodescribeDashboardSummarizeIdPost(id)

POST /api/ee/autodescribe/dashboard/summarize/{id}

Provide a summary of a dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAutodescribeApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEeAutodescribeDashboardSummarizeIdPost(id, (error, data, response) => {
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

