# MetabaseApi.ApiActionApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiActionActionIdDelete**](ApiActionApi.md#apiActionActionIdDelete) | **DELETE** /api/action/{action-id} | DELETE /api/action/{action-id}
[**apiActionActionIdExecuteGet**](ApiActionApi.md#apiActionActionIdExecuteGet) | **GET** /api/action/{action-id}/execute | GET /api/action/{action-id}/execute
[**apiActionActionIdGet**](ApiActionApi.md#apiActionActionIdGet) | **GET** /api/action/{action-id} | GET /api/action/{action-id}
[**apiActionGet**](ApiActionApi.md#apiActionGet) | **GET** /api/action/ | GET /api/action/
[**apiActionIdExecutePost**](ApiActionApi.md#apiActionIdExecutePost) | **POST** /api/action/{id}/execute | POST /api/action/{id}/execute
[**apiActionIdPublicLinkDelete**](ApiActionApi.md#apiActionIdPublicLinkDelete) | **DELETE** /api/action/{id}/public_link | DELETE /api/action/{id}/public_link
[**apiActionIdPublicLinkPost**](ApiActionApi.md#apiActionIdPublicLinkPost) | **POST** /api/action/{id}/public_link | POST /api/action/{id}/public_link
[**apiActionIdPut**](ApiActionApi.md#apiActionIdPut) | **PUT** /api/action/{id} | PUT /api/action/{id}
[**apiActionPost**](ApiActionApi.md#apiActionPost) | **POST** /api/action/ | POST /api/action/
[**apiActionPublicGet**](ApiActionApi.md#apiActionPublicGet) | **GET** /api/action/public | GET /api/action/public



## apiActionActionIdDelete

> apiActionActionIdDelete(actionId)

DELETE /api/action/{action-id}

Delete an Action.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let actionId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiActionActionIdDelete(actionId, (error, data, response) => {
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
 **actionId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiActionActionIdExecuteGet

> apiActionActionIdExecuteGet(actionId, parameters)

GET /api/action/{action-id}/execute

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let actionId = 56; // Number | value must be an integer greater than zero.
let parameters = "parameters_example"; // String | value must be a valid JSON string.
apiInstance.apiActionActionIdExecuteGet(actionId, parameters, (error, data, response) => {
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
 **actionId** | **Number**| value must be an integer greater than zero. | 
 **parameters** | **String**| value must be a valid JSON string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiActionActionIdGet

> apiActionActionIdGet(actionId)

GET /api/action/{action-id}

Fetch an Action.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let actionId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiActionActionIdGet(actionId, (error, data, response) => {
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
 **actionId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiActionGet

> apiActionGet(opts)

GET /api/action/

Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional   &#x60;?model-id&#x3D;&lt;model-id&gt;&#x60; to limit to actions on a particular model.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let opts = {
  'modelId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiActionGet(opts, (error, data, response) => {
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
 **modelId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiActionIdExecutePost

> apiActionIdExecutePost(id, opts)

POST /api/action/{id}/execute

Execute the Action.     &#x60;parameters&#x60; should be the mapped dashboard parameters with values.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiActionIdExecutePostRequest': new MetabaseApi.ApiActionIdExecutePostRequest() // ApiActionIdExecutePostRequest | 
};
apiInstance.apiActionIdExecutePost(id, opts, (error, data, response) => {
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
 **apiActionIdExecutePostRequest** | [**ApiActionIdExecutePostRequest**](ApiActionIdExecutePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiActionIdPublicLinkDelete

> apiActionIdPublicLinkDelete(id)

DELETE /api/action/{id}/public_link

Delete the publicly-accessible link to this Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiActionIdPublicLinkDelete(id, (error, data, response) => {
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


## apiActionIdPublicLinkPost

> apiActionIdPublicLinkPost(id)

POST /api/action/{id}/public_link

Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this   Action has already been shared, it will return the existing public link rather than creating a new one.) Public   sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiActionIdPublicLinkPost(id, (error, data, response) => {
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


## apiActionIdPut

> apiActionIdPut(id, opts)

PUT /api/action/{id}

Update an Action.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiActionIdPutRequest': new MetabaseApi.ApiActionIdPutRequest() // ApiActionIdPutRequest | 
};
apiInstance.apiActionIdPut(id, opts, (error, data, response) => {
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
 **apiActionIdPutRequest** | [**ApiActionIdPutRequest**](ApiActionIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiActionPost

> apiActionPost(opts)

POST /api/action/

Create a new action.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
let opts = {
  'apiActionPostRequest': new MetabaseApi.ApiActionPostRequest() // ApiActionPostRequest | 
};
apiInstance.apiActionPost(opts, (error, data, response) => {
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
 **apiActionPostRequest** | [**ApiActionPostRequest**](ApiActionPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiActionPublicGet

> apiActionPublicGet()

GET /api/action/public

Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActionApi();
apiInstance.apiActionPublicGet((error, data, response) => {
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

