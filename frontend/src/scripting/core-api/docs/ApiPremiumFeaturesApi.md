# MetabaseApi.ApiPremiumFeaturesApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPremiumFeaturesTokenStatusGet**](ApiPremiumFeaturesApi.md#apiPremiumFeaturesTokenStatusGet) | **GET** /api/premium-features/token/status | GET /api/premium-features/token/status



## apiPremiumFeaturesTokenStatusGet

> apiPremiumFeaturesTokenStatusGet()

GET /api/premium-features/token/status

Fetch info about the current Premium-Features premium features token including whether it is &#x60;valid&#x60;, a &#x60;trial&#x60; token, its   &#x60;features&#x60;, when it is &#x60;valid-thru&#x60;, and the &#x60;status&#x60; of the account.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPremiumFeaturesApi();
apiInstance.apiPremiumFeaturesTokenStatusGet((error, data, response) => {
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

