# MetabaseApi.ApiCacheApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiCacheDelete**](ApiCacheApi.md#apiCacheDelete) | **DELETE** /api/cache/ | DELETE /api/cache/
[**apiCacheGet**](ApiCacheApi.md#apiCacheGet) | **GET** /api/cache/ | GET /api/cache/
[**apiCacheInvalidatePost**](ApiCacheApi.md#apiCacheInvalidatePost) | **POST** /api/cache/invalidate | POST /api/cache/invalidate
[**apiCachePut**](ApiCacheApi.md#apiCachePut) | **PUT** /api/cache/ | PUT /api/cache/



## apiCacheDelete

> apiCacheDelete(opts)

DELETE /api/cache/

Delete cache configurations.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCacheApi();
let opts = {
  'apiCacheDeleteRequest': new MetabaseApi.ApiCacheDeleteRequest() // ApiCacheDeleteRequest | 
};
apiInstance.apiCacheDelete(opts, (error, data, response) => {
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
 **apiCacheDeleteRequest** | [**ApiCacheDeleteRequest**](ApiCacheDeleteRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCacheGet

> apiCacheGet(model, opts)

GET /api/cache/

Return cache configuration.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCacheApi();
let model = ["null"]; // [String] | Type of model
let opts = {
  'collection': 56, // Number | Collection id to filter results. Returns everything if not supplied.
  'id': 56 // Number | Model id to get configuration for.
};
apiInstance.apiCacheGet(model, opts, (error, data, response) => {
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
 **model** | [**[String]**](String.md)| Type of model | 
 **collection** | **Number**| Collection id to filter results. Returns everything if not supplied. | [optional] 
 **id** | **Number**| Model id to get configuration for. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCacheInvalidatePost

> apiCacheInvalidatePost(opts)

POST /api/cache/invalidate

Invalidate cache entries.    Use it like &#x60;/api/cache/invalidate?database&#x3D;1&amp;dashboard&#x3D;15&#x60; (any number of database/dashboard/question can be   supplied).    &#x60;&amp;include&#x3D;overrides&#x60; controls whenever you want to invalidate cache for a specific cache configuration without   touching all nested configurations, or you want your invalidation to trickle down to every card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCacheApi();
let opts = {
  'include': null, // Object | All cache configuration overrides should invalidate cache too
  'database': [null], // [Number] | A list of database ids
  'dashboard': [null], // [Number] | A list of dashboard ids
  'question': [null] // [Number] | A list of question ids
};
apiInstance.apiCacheInvalidatePost(opts, (error, data, response) => {
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
 **include** | [**Object**](.md)| All cache configuration overrides should invalidate cache too | [optional] 
 **database** | [**[Number]**](Number.md)| A list of database ids | [optional] 
 **dashboard** | [**[Number]**](Number.md)| A list of dashboard ids | [optional] 
 **question** | [**[Number]**](Number.md)| A list of question ids | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCachePut

> apiCachePut(opts)

PUT /api/cache/

Store cache configuration.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCacheApi();
let opts = {
  'apiCachePutRequest': new MetabaseApi.ApiCachePutRequest() // ApiCachePutRequest | 
};
apiInstance.apiCachePut(opts, (error, data, response) => {
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
 **apiCachePutRequest** | [**ApiCachePutRequest**](ApiCachePutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

