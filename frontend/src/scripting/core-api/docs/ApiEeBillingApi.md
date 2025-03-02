# MetabaseApi.ApiEeBillingApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeBillingGet**](ApiEeBillingApi.md#apiEeBillingGet) | **GET** /api/ee/billing/ | GET /api/ee/billing/



## apiEeBillingGet

> apiEeBillingGet()

GET /api/ee/billing/

Get billing information. This acts as a proxy between &#x60;metabase-billing-info-url&#x60; and the client,    using the embedding token and signed in user&#39;s email to fetch the billing information.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeBillingApi();
apiInstance.apiEeBillingGet((error, data, response) => {
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

