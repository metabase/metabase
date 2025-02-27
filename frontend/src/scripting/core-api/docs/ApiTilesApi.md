# MetabaseApi.ApiTilesApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTilesZoomXYLatFieldLonFieldGet**](ApiTilesApi.md#apiTilesZoomXYLatFieldLonFieldGet) | **GET** /api/tiles/{zoom}/{x}/{y}/{lat-field}/{lon-field} | GET /api/tiles/{zoom}/{x}/{y}/{lat-field}/{lon-field}



## apiTilesZoomXYLatFieldLonFieldGet

> apiTilesZoomXYLatFieldLonFieldGet(zoom, x, y, latField, lonField, query)

GET /api/tiles/{zoom}/{x}/{y}/{lat-field}/{lon-field}

This endpoints provides an image with the appropriate pins rendered given a MBQL &#x60;query&#x60; (passed as a GET query   string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the   appropriate ones. It&#39;s expected that to render a full map view several calls will be made to this endpoint in   parallel.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTilesApi();
let zoom = 56; // Number | value must be an integer.
let x = 56; // Number | value must be an integer.
let y = 56; // Number | value must be an integer.
let latField = "latField_example"; // String | 
let lonField = "lonField_example"; // String | 
let query = "query_example"; // String | value must be a valid JSON string.
apiInstance.apiTilesZoomXYLatFieldLonFieldGet(zoom, x, y, latField, lonField, query, (error, data, response) => {
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
 **zoom** | **Number**| value must be an integer. | 
 **x** | **Number**| value must be an integer. | 
 **y** | **Number**| value must be an integer. | 
 **latField** | **String**|  | 
 **lonField** | **String**|  | 
 **query** | **String**| value must be a valid JSON string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

