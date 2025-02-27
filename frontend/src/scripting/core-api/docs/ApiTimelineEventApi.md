# MetabaseApi.ApiTimelineEventApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTimelineEventIdDelete**](ApiTimelineEventApi.md#apiTimelineEventIdDelete) | **DELETE** /api/timeline-event/{id} | DELETE /api/timeline-event/{id}
[**apiTimelineEventIdGet**](ApiTimelineEventApi.md#apiTimelineEventIdGet) | **GET** /api/timeline-event/{id} | GET /api/timeline-event/{id}
[**apiTimelineEventIdPut**](ApiTimelineEventApi.md#apiTimelineEventIdPut) | **PUT** /api/timeline-event/{id} | PUT /api/timeline-event/{id}
[**apiTimelineEventPost**](ApiTimelineEventApi.md#apiTimelineEventPost) | **POST** /api/timeline-event/ | POST /api/timeline-event/



## apiTimelineEventIdDelete

> apiTimelineEventIdDelete(id)

DELETE /api/timeline-event/{id}

Delete a [[TimelineEvent]].

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineEventApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTimelineEventIdDelete(id, (error, data, response) => {
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


## apiTimelineEventIdGet

> apiTimelineEventIdGet(id)

GET /api/timeline-event/{id}

Fetch the [[TimelineEvent]] with &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineEventApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTimelineEventIdGet(id, (error, data, response) => {
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


## apiTimelineEventIdPut

> apiTimelineEventIdPut(id, opts)

PUT /api/timeline-event/{id}

Update a [[TimelineEvent]].

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineEventApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiTimelineEventIdPutRequest': new MetabaseApi.ApiTimelineEventIdPutRequest() // ApiTimelineEventIdPutRequest | 
};
apiInstance.apiTimelineEventIdPut(id, opts, (error, data, response) => {
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
 **apiTimelineEventIdPutRequest** | [**ApiTimelineEventIdPutRequest**](ApiTimelineEventIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTimelineEventPost

> apiTimelineEventPost(opts)

POST /api/timeline-event/

Create a new [[TimelineEvent]].

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTimelineEventApi();
let opts = {
  'apiTimelineEventPostRequest': new MetabaseApi.ApiTimelineEventPostRequest() // ApiTimelineEventPostRequest | 
};
apiInstance.apiTimelineEventPost(opts, (error, data, response) => {
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
 **apiTimelineEventPostRequest** | [**ApiTimelineEventPostRequest**](ApiTimelineEventPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

