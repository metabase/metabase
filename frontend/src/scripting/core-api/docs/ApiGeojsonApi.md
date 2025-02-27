# MetabaseApi.ApiGeojsonApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiGeojsonGet**](ApiGeojsonApi.md#apiGeojsonGet) | **GET** /api/geojson/ | GET /api/geojson/
[**apiGeojsonKeyGet**](ApiGeojsonApi.md#apiGeojsonKeyGet) | **GET** /api/geojson/{key} | GET /api/geojson/{key}



## apiGeojsonGet

> apiGeojsonGet(url)

GET /api/geojson/

Load a custom GeoJSON file based on a URL or file path provided as a query parameter.   This behaves similarly to /api/geojson/:key but doesn&#39;t require the custom map to be saved to the DB first.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiGeojsonApi();
let url = "url_example"; // String | value must be a non-blank string.
apiInstance.apiGeojsonGet(url, (error, data, response) => {
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
 **url** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiGeojsonKeyGet

> apiGeojsonKeyGet(key)

GET /api/geojson/{key}

Fetch a custom GeoJSON file as defined in the &#x60;custom-geojson&#x60; setting. (This just acts as a simple proxy for the   file specified for &#x60;key&#x60;).

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiGeojsonApi();
let key = "key_example"; // String | value must be a non-blank string.
apiInstance.apiGeojsonKeyGet(key, (error, data, response) => {
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
 **key** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

