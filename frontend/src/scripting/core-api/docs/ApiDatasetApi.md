# MetabaseApi.ApiDatasetApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiDatasetExportFormatPost**](ApiDatasetApi.md#apiDatasetExportFormatPost) | **POST** /api/dataset/{export-format} | POST /api/dataset/{export-format}
[**apiDatasetNativePost**](ApiDatasetApi.md#apiDatasetNativePost) | **POST** /api/dataset/native | POST /api/dataset/native
[**apiDatasetParameterSearchQueryPost**](ApiDatasetApi.md#apiDatasetParameterSearchQueryPost) | **POST** /api/dataset/parameter/search/{query} | POST /api/dataset/parameter/search/{query}
[**apiDatasetParameterValuesPost**](ApiDatasetApi.md#apiDatasetParameterValuesPost) | **POST** /api/dataset/parameter/values | POST /api/dataset/parameter/values
[**apiDatasetPivotPost**](ApiDatasetApi.md#apiDatasetPivotPost) | **POST** /api/dataset/pivot | POST /api/dataset/pivot
[**apiDatasetPost**](ApiDatasetApi.md#apiDatasetPost) | **POST** /api/dataset/ | POST /api/dataset/
[**apiDatasetQueryMetadataPost**](ApiDatasetApi.md#apiDatasetQueryMetadataPost) | **POST** /api/dataset/query_metadata | POST /api/dataset/query_metadata



## apiDatasetExportFormatPost

> apiDatasetExportFormatPost(exportFormat, opts)

POST /api/dataset/{export-format}

Execute a query and download the result data as a file in the specified format.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let exportFormat = "exportFormat_example"; // String | 
let opts = {
  'apiDatasetExportFormatPostRequest': new MetabaseApi.ApiDatasetExportFormatPostRequest() // ApiDatasetExportFormatPostRequest | 
};
apiInstance.apiDatasetExportFormatPost(exportFormat, opts, (error, data, response) => {
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
 **exportFormat** | **String**|  | 
 **apiDatasetExportFormatPostRequest** | [**ApiDatasetExportFormatPostRequest**](ApiDatasetExportFormatPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetNativePost

> apiDatasetNativePost(opts)

POST /api/dataset/native

Fetch a native version of an MBQL query.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let opts = {
  'apiDatasetNativePostRequest': new MetabaseApi.ApiDatasetNativePostRequest() // ApiDatasetNativePostRequest | 
};
apiInstance.apiDatasetNativePost(opts, (error, data, response) => {
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
 **apiDatasetNativePostRequest** | [**ApiDatasetNativePostRequest**](ApiDatasetNativePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetParameterSearchQueryPost

> apiDatasetParameterSearchQueryPost(query, opts)

POST /api/dataset/parameter/search/{query}

Return parameter values for cards or dashboards that are being edited. Expects a query string at &#x60;?query&#x3D;foo&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let query = "query_example"; // String | value must be a non-blank string.
let opts = {
  'apiDatasetParameterSearchQueryPostRequest': new MetabaseApi.ApiDatasetParameterSearchQueryPostRequest() // ApiDatasetParameterSearchQueryPostRequest | 
};
apiInstance.apiDatasetParameterSearchQueryPost(query, opts, (error, data, response) => {
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
 **query** | **String**| value must be a non-blank string. | 
 **apiDatasetParameterSearchQueryPostRequest** | [**ApiDatasetParameterSearchQueryPostRequest**](ApiDatasetParameterSearchQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetParameterValuesPost

> apiDatasetParameterValuesPost(opts)

POST /api/dataset/parameter/values

Return parameter values for cards or dashboards that are being edited.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let opts = {
  'apiDatasetParameterSearchQueryPostRequest': new MetabaseApi.ApiDatasetParameterSearchQueryPostRequest() // ApiDatasetParameterSearchQueryPostRequest | 
};
apiInstance.apiDatasetParameterValuesPost(opts, (error, data, response) => {
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
 **apiDatasetParameterSearchQueryPostRequest** | [**ApiDatasetParameterSearchQueryPostRequest**](ApiDatasetParameterSearchQueryPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetPivotPost

> apiDatasetPivotPost(opts)

POST /api/dataset/pivot

Generate a pivoted dataset for an ad-hoc query

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let opts = {
  'apiDatasetPivotPostRequest': new MetabaseApi.ApiDatasetPivotPostRequest() // ApiDatasetPivotPostRequest | 
};
apiInstance.apiDatasetPivotPost(opts, (error, data, response) => {
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
 **apiDatasetPivotPostRequest** | [**ApiDatasetPivotPostRequest**](ApiDatasetPivotPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetPost

> apiDatasetPost(opts)

POST /api/dataset/

Execute a query and retrieve the results in the usual format. The query will not use the cache.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let opts = {
  'apiDatasetPostRequest': new MetabaseApi.ApiDatasetPostRequest() // ApiDatasetPostRequest | 
};
apiInstance.apiDatasetPost(opts, (error, data, response) => {
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
 **apiDatasetPostRequest** | [**ApiDatasetPostRequest**](ApiDatasetPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatasetQueryMetadataPost

> apiDatasetQueryMetadataPost(opts)

POST /api/dataset/query_metadata

Get all of the required query metadata for an ad-hoc query.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatasetApi();
let opts = {
  'apiDatasetQueryMetadataPostRequest': new MetabaseApi.ApiDatasetQueryMetadataPostRequest() // ApiDatasetQueryMetadataPostRequest | 
};
apiInstance.apiDatasetQueryMetadataPost(opts, (error, data, response) => {
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
 **apiDatasetQueryMetadataPostRequest** | [**ApiDatasetQueryMetadataPostRequest**](ApiDatasetQueryMetadataPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

