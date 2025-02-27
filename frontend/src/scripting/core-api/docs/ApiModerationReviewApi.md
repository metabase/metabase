# MetabaseApi.ApiModerationReviewApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiModerationReviewPost**](ApiModerationReviewApi.md#apiModerationReviewPost) | **POST** /api/moderation-review/ | POST /api/moderation-review/



## apiModerationReviewPost

> apiModerationReviewPost(opts)

POST /api/moderation-review/

Create a new &#x60;ModerationReview&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiModerationReviewApi();
let opts = {
  'apiModerationReviewPostRequest': new MetabaseApi.ApiModerationReviewPostRequest() // ApiModerationReviewPostRequest | 
};
apiInstance.apiModerationReviewPost(opts, (error, data, response) => {
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
 **apiModerationReviewPostRequest** | [**ApiModerationReviewPostRequest**](ApiModerationReviewPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

