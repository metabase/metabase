# MetabaseApi.ApiEeQueryReferenceValidationApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeQueryReferenceValidationInvalidCardsGet**](ApiEeQueryReferenceValidationApi.md#apiEeQueryReferenceValidationInvalidCardsGet) | **GET** /api/ee/query-reference-validation/invalid-cards | GET /api/ee/query-reference-validation/invalid-cards



## apiEeQueryReferenceValidationInvalidCardsGet

> apiEeQueryReferenceValidationInvalidCardsGet(opts)

GET /api/ee/query-reference-validation/invalid-cards

List of cards that have an invalid reference in their query. Shape of each card is standard, with the addition of an   &#x60;errors&#x60; key. Supports pagination (&#x60;offset&#x60; and &#x60;limit&#x60;), so it returns something in the shape:    &#x60;&#x60;&#x60;     {:total  200      :data   [card1, card2, ...]      :limit  50      :offset 100   &#x60;&#x60;&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeQueryReferenceValidationApi();
let opts = {
  'sortColumn': "sortColumn_example", // String | 
  'sortDirection': "sortDirection_example", // String | 
  'collectionId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiEeQueryReferenceValidationInvalidCardsGet(opts, (error, data, response) => {
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
 **sortColumn** | **String**|  | [optional] 
 **sortDirection** | **String**|  | [optional] 
 **collectionId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

