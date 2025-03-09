# MetabaseApi.ApiTimelineApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTimelineCollectionIdGet**](ApiTimelineApi.md#apiTimelineCollectionIdGet) | **GET** /api/timeline/collection/{id} | GET /api/timeline/collection/{id}
[**apiTimelineCollectionRootGet**](ApiTimelineApi.md#apiTimelineCollectionRootGet) | **GET** /api/timeline/collection/root | GET /api/timeline/collection/root
[**apiTimelineGet**](ApiTimelineApi.md#apiTimelineGet) | **GET** /api/timeline/ | GET /api/timeline/
[**apiTimelineIdDelete**](ApiTimelineApi.md#apiTimelineIdDelete) | **DELETE** /api/timeline/{id} | DELETE /api/timeline/{id}
[**apiTimelineIdGet**](ApiTimelineApi.md#apiTimelineIdGet) | **GET** /api/timeline/{id} | GET /api/timeline/{id}
[**apiTimelineIdPut**](ApiTimelineApi.md#apiTimelineIdPut) | **PUT** /api/timeline/{id} | PUT /api/timeline/{id}
[**apiTimelinePost**](ApiTimelineApi.md#apiTimelinePost) | **POST** /api/timeline/ | POST /api/timeline/



## apiTimelineCollectionIdGet

> apiTimelineCollectionIdGet(id, opts)

GET /api/timeline/collection/{id}

Fetch a specific Collection&#39;s timelines.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'include': null, // Object | 
  'archived': false // Boolean | 
};
apiInstance.apiTimelineCollectionIdGet(id, opts, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 
 **include** | [**Object**](.md)|  | [optional] 
 **archived** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTimelineCollectionRootGet

> apiTimelineCollectionRootGet(opts)

GET /api/timeline/collection/root

Fetch the root Collection&#39;s timelines.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let opts = {
  'include': null, // Object | 
  'archived': false // Boolean | 
};
apiInstance.apiTimelineCollectionRootGet(opts, (error, data, response) => {
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
 **include** | [**Object**](.md)|  | [optional] 
 **archived** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTimelineGet

> apiTimelineGet(archived, opts)

GET /api/timeline/

Fetch a list of &#x60;Timeline&#x60;s. Can include &#x60;archived&#x3D;true&#x60; to return archived timelines.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let archived = false; // Boolean | 
let opts = {
  'include': new MetabaseApi.MetabaseTimelineApiTimelineInclude() // MetabaseTimelineApiTimelineInclude | 
};
apiInstance.apiTimelineGet(archived, opts, (error, data, response) => {
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
 **archived** | **Boolean**|  | [default to false]
 **include** | [**MetabaseTimelineApiTimelineInclude**](.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTimelineIdDelete

> apiTimelineIdDelete(id)

DELETE /api/timeline/{id}

Delete a [[Timeline]]. Will cascade delete its events as well.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTimelineIdDelete(id, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTimelineIdGet

> apiTimelineIdGet(id, archived, opts)

GET /api/timeline/{id}

Fetch the &#x60;Timeline&#x60; with &#x60;id&#x60;. Include &#x60;include&#x3D;events&#x60; to unarchived events included on the timeline. Add   &#x60;archived&#x3D;true&#x60; to return all events on the timeline, both archived and unarchived.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let id = 56; // Number | value must be an integer greater than zero.
let archived = false; // Boolean | 
let opts = {
  'include': new MetabaseApi.MetabaseTimelineApiTimelineInclude(), // MetabaseTimelineApiTimelineInclude | 
  'start': "start_example", // String | value must be a valid date string
  'end': "end_example" // String | value must be a valid date string
};
apiInstance.apiTimelineIdGet(id, archived, opts, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 
 **archived** | **Boolean**|  | [default to false]
 **include** | [**MetabaseTimelineApiTimelineInclude**](.md)|  | [optional] 
 **start** | **String**| value must be a valid date string | [optional] 
 **end** | **String**| value must be a valid date string | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTimelineIdPut

> apiTimelineIdPut(id, opts)

PUT /api/timeline/{id}

Update the [[Timeline]] with &#x60;id&#x60;. Returns the timeline without events. Archiving a timeline will archive all of the   events in that timeline.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiTimelineIdPutRequest': new MetabaseApi.ApiTimelineIdPutRequest() // ApiTimelineIdPutRequest | 
};
apiInstance.apiTimelineIdPut(id, opts, (error, data, response) => {
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
 **id** | **Number**| value must be an integer greater than zero. | 
 **apiTimelineIdPutRequest** | [**ApiTimelineIdPutRequest**](ApiTimelineIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTimelinePost

> apiTimelinePost(opts)

POST /api/timeline/

Create a new [[Timeline]].

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineApi();
let opts = {
  'apiTimelinePostRequest': new MetabaseApi.ApiTimelinePostRequest() // ApiTimelinePostRequest | 
};
apiInstance.apiTimelinePost(opts, (error, data, response) => {
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
 **apiTimelinePostRequest** | [**ApiTimelinePostRequest**](ApiTimelinePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

