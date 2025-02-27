# MetabaseApi.ApiUtilApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiUtilBugReportDetailsGet**](ApiUtilApi.md#apiUtilBugReportDetailsGet) | **GET** /api/util/bug_report_details | GET /api/util/bug_report_details
[**apiUtilDiagnosticInfoConnectionPoolInfoGet**](ApiUtilApi.md#apiUtilDiagnosticInfoConnectionPoolInfoGet) | **GET** /api/util/diagnostic_info/connection_pool_info | GET /api/util/diagnostic_info/connection_pool_info
[**apiUtilEntityIdPost**](ApiUtilApi.md#apiUtilEntityIdPost) | **POST** /api/util/entity_id | POST /api/util/entity_id
[**apiUtilLogsGet**](ApiUtilApi.md#apiUtilLogsGet) | **GET** /api/util/logs | GET /api/util/logs
[**apiUtilPasswordCheckPost**](ApiUtilApi.md#apiUtilPasswordCheckPost) | **POST** /api/util/password_check | POST /api/util/password_check
[**apiUtilProductFeedbackPost**](ApiUtilApi.md#apiUtilProductFeedbackPost) | **POST** /api/util/product-feedback | POST /api/util/product-feedback
[**apiUtilRandomTokenGet**](ApiUtilApi.md#apiUtilRandomTokenGet) | **GET** /api/util/random_token | GET /api/util/random_token
[**apiUtilStatsGet**](ApiUtilApi.md#apiUtilStatsGet) | **GET** /api/util/stats | GET /api/util/stats



## apiUtilBugReportDetailsGet

> apiUtilBugReportDetailsGet()

GET /api/util/bug_report_details

Returns version and system information relevant to filing a bug report against Metabase.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
apiInstance.apiUtilBugReportDetailsGet((error, data, response) => {
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


## apiUtilDiagnosticInfoConnectionPoolInfoGet

> apiUtilDiagnosticInfoConnectionPoolInfoGet()

GET /api/util/diagnostic_info/connection_pool_info

Returns database connection pool info for the current Metabase instance.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
apiInstance.apiUtilDiagnosticInfoConnectionPoolInfoGet((error, data, response) => {
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


## apiUtilEntityIdPost

> apiUtilEntityIdPost(opts)

POST /api/util/entity_id

Translate entity IDs to model IDs.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
let opts = {
  'apiUtilEntityIdPostRequest': new MetabaseApi.ApiUtilEntityIdPostRequest() // ApiUtilEntityIdPostRequest | 
};
apiInstance.apiUtilEntityIdPost(opts, (error, data, response) => {
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
 **apiUtilEntityIdPostRequest** | [**ApiUtilEntityIdPostRequest**](ApiUtilEntityIdPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUtilLogsGet

> apiUtilLogsGet()

GET /api/util/logs

Logs.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
apiInstance.apiUtilLogsGet((error, data, response) => {
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


## apiUtilPasswordCheckPost

> apiUtilPasswordCheckPost(opts)

POST /api/util/password_check

Endpoint that checks if the supplied password meets the currently configured password complexity rules.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
let opts = {
  'apiUserIdPasswordPutRequest': new MetabaseApi.ApiUserIdPasswordPutRequest() // ApiUserIdPasswordPutRequest | 
};
apiInstance.apiUtilPasswordCheckPost(opts, (error, data, response) => {
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
 **apiUserIdPasswordPutRequest** | [**ApiUserIdPasswordPutRequest**](ApiUserIdPasswordPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUtilProductFeedbackPost

> apiUtilProductFeedbackPost(opts)

POST /api/util/product-feedback

Endpoint to provide feedback from the product

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
let opts = {
  'apiUtilProductFeedbackPostRequest': new MetabaseApi.ApiUtilProductFeedbackPostRequest() // ApiUtilProductFeedbackPostRequest | 
};
apiInstance.apiUtilProductFeedbackPost(opts, (error, data, response) => {
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
 **apiUtilProductFeedbackPostRequest** | [**ApiUtilProductFeedbackPostRequest**](ApiUtilProductFeedbackPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUtilRandomTokenGet

> apiUtilRandomTokenGet()

GET /api/util/random_token

Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.    Intended for use when creating a value for &#x60;embedding-secret-key&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
apiInstance.apiUtilRandomTokenGet((error, data, response) => {
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


## apiUtilStatsGet

> apiUtilStatsGet()

GET /api/util/stats

Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see   what is being phoned home.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUtilApi();
apiInstance.apiUtilStatsGet((error, data, response) => {
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

