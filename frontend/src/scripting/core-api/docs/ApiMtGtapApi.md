# MetabaseApi.ApiMtGtapApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiMtGtapGet**](ApiMtGtapApi.md#apiMtGtapGet) | **GET** /api/mt/gtap/ | GET /api/mt/gtap/
[**apiMtGtapIdDelete**](ApiMtGtapApi.md#apiMtGtapIdDelete) | **DELETE** /api/mt/gtap/{id} | DELETE /api/mt/gtap/{id}
[**apiMtGtapIdGet**](ApiMtGtapApi.md#apiMtGtapIdGet) | **GET** /api/mt/gtap/{id} | GET /api/mt/gtap/{id}
[**apiMtGtapIdPut**](ApiMtGtapApi.md#apiMtGtapIdPut) | **PUT** /api/mt/gtap/{id} | PUT /api/mt/gtap/{id}
[**apiMtGtapPost**](ApiMtGtapApi.md#apiMtGtapPost) | **POST** /api/mt/gtap/ | POST /api/mt/gtap/
[**apiMtGtapValidatePost**](ApiMtGtapApi.md#apiMtGtapValidatePost) | **POST** /api/mt/gtap/validate | POST /api/mt/gtap/validate



## apiMtGtapGet

> apiMtGtapGet(opts)

GET /api/mt/gtap/

Fetch a list of all GTAPs currently in use, or a single GTAP if both &#x60;group_id&#x60; and &#x60;table_id&#x60; are provided.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let opts = {
  'groupId': 56, // Number | value must be an integer greater than zero.
  'tableId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiMtGtapGet(opts, (error, data, response) => {
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
 **groupId** | **Number**| value must be an integer greater than zero. | [optional] 
 **tableId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiMtGtapIdDelete

> apiMtGtapIdDelete(id)

DELETE /api/mt/gtap/{id}

Delete a GTAP entry.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiMtGtapIdDelete(id, (error, data, response) => {
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


## apiMtGtapIdGet

> apiMtGtapIdGet(id)

GET /api/mt/gtap/{id}

Fetch GTAP by &#x60;id&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiMtGtapIdGet(id, (error, data, response) => {
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


## apiMtGtapIdPut

> apiMtGtapIdPut(id, opts)

PUT /api/mt/gtap/{id}

Update a GTAP entry. The only things you&#39;re allowed to update for a GTAP are the Card being used (&#x60;card_id&#x60;) or the   paramter mappings; changing &#x60;table_id&#x60; or &#x60;group_id&#x60; would effectively be deleting this entry and creating a new   one. If that&#39;s what you want to do, do so explicity with appropriate calls to the &#x60;DELETE&#x60; and &#x60;POST&#x60; endpoints.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiMtGtapIdPutRequest': new MetabaseApi.ApiMtGtapIdPutRequest() // ApiMtGtapIdPutRequest | 
};
apiInstance.apiMtGtapIdPut(id, opts, (error, data, response) => {
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
 **apiMtGtapIdPutRequest** | [**ApiMtGtapIdPutRequest**](ApiMtGtapIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiMtGtapPost

> apiMtGtapPost(opts)

POST /api/mt/gtap/

Create a new GTAP.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let opts = {
  'apiMtGtapPostRequest': new MetabaseApi.ApiMtGtapPostRequest() // ApiMtGtapPostRequest | 
};
apiInstance.apiMtGtapPost(opts, (error, data, response) => {
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
 **apiMtGtapPostRequest** | [**ApiMtGtapPostRequest**](ApiMtGtapPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiMtGtapValidatePost

> apiMtGtapValidatePost(opts)

POST /api/mt/gtap/validate

Validate a sandbox which may not have yet been saved. This runs the same validation that is performed when the   sandbox is saved, but doesn&#39;t actually save the sandbox.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiMtGtapApi();
let opts = {
  'apiMtGtapValidatePostRequest': new MetabaseApi.ApiMtGtapValidatePostRequest() // ApiMtGtapValidatePostRequest | 
};
apiInstance.apiMtGtapValidatePost(opts, (error, data, response) => {
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
 **apiMtGtapValidatePostRequest** | [**ApiMtGtapValidatePostRequest**](ApiMtGtapValidatePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

