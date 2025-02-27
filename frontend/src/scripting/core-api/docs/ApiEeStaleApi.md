# MetabaseApi.ApiEeStaleApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeStaleIdGet**](ApiEeStaleApi.md#apiEeStaleIdGet) | **GET** /api/ee/stale/{id} | GET /api/ee/stale/{id}



## apiEeStaleIdGet

> apiEeStaleIdGet(id, isRecursive, sortColumn, sortDirection, opts)

GET /api/ee/stale/{id}

A flexible endpoint that returns stale entities, in the same shape as collections/items, with the following options:   - &#x60;before_date&#x60; - only return entities that were last edited before this date (default: 6 months ago)   - &#x60;is_recursive&#x60; - if true, return entities from all children of the collection, not just the direct children (default: false)   - &#x60;sort_column&#x60; - the column to sort by (default: name)   - &#x60;sort_direction&#x60; - the direction to sort by (default: asc)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeStaleApi();
let id = 56; // Number | 
let isRecursive = false; // Boolean | 
let sortColumn = "'name'"; // String | 
let sortDirection = "'asc'"; // String | 
let opts = {
  'beforeDate': "beforeDate_example" // String | 
};
apiInstance.apiEeStaleIdGet(id, isRecursive, sortColumn, sortDirection, opts, (error, data, response) => {
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
 **id** | **Number**|  | 
 **isRecursive** | **Boolean**|  | [default to false]
 **sortColumn** | **String**|  | [default to &#39;name&#39;]
 **sortDirection** | **String**|  | [default to &#39;asc&#39;]
 **beforeDate** | **String**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

