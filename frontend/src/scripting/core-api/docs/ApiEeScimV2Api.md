# MetabaseApi.ApiEeScimV2Api

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeScimV2GroupsGet**](ApiEeScimV2Api.md#apiEeScimV2GroupsGet) | **GET** /api/ee/scim/v2/Groups | GET /api/ee/scim/v2/Groups
[**apiEeScimV2GroupsIdDelete**](ApiEeScimV2Api.md#apiEeScimV2GroupsIdDelete) | **DELETE** /api/ee/scim/v2/Groups/{id} | DELETE /api/ee/scim/v2/Groups/{id}
[**apiEeScimV2GroupsIdGet**](ApiEeScimV2Api.md#apiEeScimV2GroupsIdGet) | **GET** /api/ee/scim/v2/Groups/{id} | GET /api/ee/scim/v2/Groups/{id}
[**apiEeScimV2GroupsIdPut**](ApiEeScimV2Api.md#apiEeScimV2GroupsIdPut) | **PUT** /api/ee/scim/v2/Groups/{id} | PUT /api/ee/scim/v2/Groups/{id}
[**apiEeScimV2GroupsPost**](ApiEeScimV2Api.md#apiEeScimV2GroupsPost) | **POST** /api/ee/scim/v2/Groups | POST /api/ee/scim/v2/Groups
[**apiEeScimV2UsersGet**](ApiEeScimV2Api.md#apiEeScimV2UsersGet) | **GET** /api/ee/scim/v2/Users | GET /api/ee/scim/v2/Users
[**apiEeScimV2UsersIdGet**](ApiEeScimV2Api.md#apiEeScimV2UsersIdGet) | **GET** /api/ee/scim/v2/Users/{id} | GET /api/ee/scim/v2/Users/{id}
[**apiEeScimV2UsersIdPatch**](ApiEeScimV2Api.md#apiEeScimV2UsersIdPatch) | **PATCH** /api/ee/scim/v2/Users/{id} | PATCH /api/ee/scim/v2/Users/{id}
[**apiEeScimV2UsersIdPut**](ApiEeScimV2Api.md#apiEeScimV2UsersIdPut) | **PUT** /api/ee/scim/v2/Users/{id} | PUT /api/ee/scim/v2/Users/{id}
[**apiEeScimV2UsersPost**](ApiEeScimV2Api.md#apiEeScimV2UsersPost) | **POST** /api/ee/scim/v2/Users | POST /api/ee/scim/v2/Users



## apiEeScimV2GroupsGet

> apiEeScimV2GroupsGet(opts)

GET /api/ee/scim/v2/Groups

Fetch a list of groups.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'startIndex': 56, // Number | value must be an integer greater than zero.
  'count': 56, // Number | value must be an integer greater than zero.
  'filter': "filter_example" // String | value must be a non-blank string.
};
apiInstance.apiEeScimV2GroupsGet(opts, (error, data, response) => {
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
 **startIndex** | **Number**| value must be an integer greater than zero. | [optional] 
 **count** | **Number**| value must be an integer greater than zero. | [optional] 
 **filter** | **String**| value must be a non-blank string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeScimV2GroupsIdDelete

> apiEeScimV2GroupsIdDelete(id)

DELETE /api/ee/scim/v2/Groups/{id}

Delete a group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let id = "id_example"; // String | value must be a non-blank string.
apiInstance.apiEeScimV2GroupsIdDelete(id, (error, data, response) => {
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
 **id** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeScimV2GroupsIdGet

> apiEeScimV2GroupsIdGet(id)

GET /api/ee/scim/v2/Groups/{id}

Fetch a single group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let id = "id_example"; // String | value must be a non-blank string.
apiInstance.apiEeScimV2GroupsIdGet(id, (error, data, response) => {
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
 **id** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeScimV2GroupsIdPut

> apiEeScimV2GroupsIdPut(opts)

PUT /api/ee/scim/v2/Groups/{id}

Update a group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'apiEeScimV2GroupsPostRequest': new MetabaseApi.ApiEeScimV2GroupsPostRequest() // ApiEeScimV2GroupsPostRequest | 
};
apiInstance.apiEeScimV2GroupsIdPut(opts, (error, data, response) => {
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
 **apiEeScimV2GroupsPostRequest** | [**ApiEeScimV2GroupsPostRequest**](ApiEeScimV2GroupsPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEeScimV2GroupsPost

> apiEeScimV2GroupsPost(opts)

POST /api/ee/scim/v2/Groups

Create a single group, and populates it if necessary.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'apiEeScimV2GroupsPostRequest': new MetabaseApi.ApiEeScimV2GroupsPostRequest() // ApiEeScimV2GroupsPostRequest | 
};
apiInstance.apiEeScimV2GroupsPost(opts, (error, data, response) => {
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
 **apiEeScimV2GroupsPostRequest** | [**ApiEeScimV2GroupsPostRequest**](ApiEeScimV2GroupsPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEeScimV2UsersGet

> apiEeScimV2UsersGet(opts)

GET /api/ee/scim/v2/Users

Fetch a list of users.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'startIndex': 56, // Number | value must be an integer greater than zero.
  'count': 56, // Number | value must be an integer greater than zero.
  'filter': "filter_example" // String | value must be a non-blank string.
};
apiInstance.apiEeScimV2UsersGet(opts, (error, data, response) => {
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
 **startIndex** | **Number**| value must be an integer greater than zero. | [optional] 
 **count** | **Number**| value must be an integer greater than zero. | [optional] 
 **filter** | **String**| value must be a non-blank string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeScimV2UsersIdGet

> apiEeScimV2UsersIdGet(id)

GET /api/ee/scim/v2/Users/{id}

Fetch a single user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let id = "id_example"; // String | value must be a non-blank string.
apiInstance.apiEeScimV2UsersIdGet(id, (error, data, response) => {
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
 **id** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeScimV2UsersIdPatch

> apiEeScimV2UsersIdPatch(id, opts)

PATCH /api/ee/scim/v2/Users/{id}

Activate or deactivate a user. Supports specific replace operations, but not arbitrary patches.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let id = "id_example"; // String | value must be a non-blank string.
let opts = {
  'apiEeScimV2UsersIdPatchRequest': new MetabaseApi.ApiEeScimV2UsersIdPatchRequest() // ApiEeScimV2UsersIdPatchRequest | 
};
apiInstance.apiEeScimV2UsersIdPatch(id, opts, (error, data, response) => {
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
 **id** | **String**| value must be a non-blank string. | 
 **apiEeScimV2UsersIdPatchRequest** | [**ApiEeScimV2UsersIdPatchRequest**](ApiEeScimV2UsersIdPatchRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEeScimV2UsersIdPut

> apiEeScimV2UsersIdPut(opts)

PUT /api/ee/scim/v2/Users/{id}

Update a user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'apiEeScimV2UsersPostRequest': new MetabaseApi.ApiEeScimV2UsersPostRequest() // ApiEeScimV2UsersPostRequest | 
};
apiInstance.apiEeScimV2UsersIdPut(opts, (error, data, response) => {
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
 **apiEeScimV2UsersPostRequest** | [**ApiEeScimV2UsersPostRequest**](ApiEeScimV2UsersPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiEeScimV2UsersPost

> apiEeScimV2UsersPost(opts)

POST /api/ee/scim/v2/Users

Create a single user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeScimV2Api();
let opts = {
  'apiEeScimV2UsersPostRequest': new MetabaseApi.ApiEeScimV2UsersPostRequest() // ApiEeScimV2UsersPostRequest | 
};
apiInstance.apiEeScimV2UsersPost(opts, (error, data, response) => {
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
 **apiEeScimV2UsersPostRequest** | [**ApiEeScimV2UsersPostRequest**](ApiEeScimV2UsersPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

