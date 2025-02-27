# MetabaseApi.ApiPermissionsApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPermissionsGraphDbDbIdGet**](ApiPermissionsApi.md#apiPermissionsGraphDbDbIdGet) | **GET** /api/permissions/graph/db/{db-id} | GET /api/permissions/graph/db/{db-id}
[**apiPermissionsGraphGet**](ApiPermissionsApi.md#apiPermissionsGraphGet) | **GET** /api/permissions/graph | GET /api/permissions/graph
[**apiPermissionsGraphGroupGroupIdGet**](ApiPermissionsApi.md#apiPermissionsGraphGroupGroupIdGet) | **GET** /api/permissions/graph/group/{group-id} | GET /api/permissions/graph/group/{group-id}
[**apiPermissionsGraphPut**](ApiPermissionsApi.md#apiPermissionsGraphPut) | **PUT** /api/permissions/graph | PUT /api/permissions/graph
[**apiPermissionsGroupGet**](ApiPermissionsApi.md#apiPermissionsGroupGet) | **GET** /api/permissions/group | GET /api/permissions/group
[**apiPermissionsGroupGroupIdDelete**](ApiPermissionsApi.md#apiPermissionsGroupGroupIdDelete) | **DELETE** /api/permissions/group/{group-id} | DELETE /api/permissions/group/{group-id}
[**apiPermissionsGroupGroupIdPut**](ApiPermissionsApi.md#apiPermissionsGroupGroupIdPut) | **PUT** /api/permissions/group/{group-id} | PUT /api/permissions/group/{group-id}
[**apiPermissionsGroupIdGet**](ApiPermissionsApi.md#apiPermissionsGroupIdGet) | **GET** /api/permissions/group/{id} | GET /api/permissions/group/{id}
[**apiPermissionsGroupPost**](ApiPermissionsApi.md#apiPermissionsGroupPost) | **POST** /api/permissions/group | POST /api/permissions/group
[**apiPermissionsMembershipGet**](ApiPermissionsApi.md#apiPermissionsMembershipGet) | **GET** /api/permissions/membership | GET /api/permissions/membership
[**apiPermissionsMembershipGroupIdClearPut**](ApiPermissionsApi.md#apiPermissionsMembershipGroupIdClearPut) | **PUT** /api/permissions/membership/{group-id}/clear | PUT /api/permissions/membership/{group-id}/clear
[**apiPermissionsMembershipIdDelete**](ApiPermissionsApi.md#apiPermissionsMembershipIdDelete) | **DELETE** /api/permissions/membership/{id} | DELETE /api/permissions/membership/{id}
[**apiPermissionsMembershipIdPut**](ApiPermissionsApi.md#apiPermissionsMembershipIdPut) | **PUT** /api/permissions/membership/{id} | PUT /api/permissions/membership/{id}
[**apiPermissionsMembershipPost**](ApiPermissionsApi.md#apiPermissionsMembershipPost) | **POST** /api/permissions/membership | POST /api/permissions/membership



## apiPermissionsGraphDbDbIdGet

> apiPermissionsGraphDbDbIdGet(dbId)

GET /api/permissions/graph/db/{db-id}

Fetch a graph of all Permissions for db-id &#x60;db-id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let dbId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsGraphDbDbIdGet(dbId, (error, data, response) => {
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
 **dbId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPermissionsGraphGet

> apiPermissionsGraphGet()

GET /api/permissions/graph

Fetch a graph of all Permissions.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
apiInstance.apiPermissionsGraphGet((error, data, response) => {
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


## apiPermissionsGraphGroupGroupIdGet

> apiPermissionsGraphGroupGroupIdGet(groupId)

GET /api/permissions/graph/group/{group-id}

Fetch a graph of all Permissions for group-id &#x60;group-id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let groupId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsGraphGroupGroupIdGet(groupId, (error, data, response) => {
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
 **groupId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPermissionsGraphPut

> apiPermissionsGraphPut(opts)

PUT /api/permissions/graph

Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same   format, that you got from &#x60;GET /api/permissions/graph&#x60;, with any changes made in the wherever necessary. This   modified graph must correspond to the &#x60;PermissionsGraph&#x60; schema. If successful, this endpoint returns the updated   permissions graph; use this as a base for any further modifications.    Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party   modifies it before you can submit you revisions, the endpoint will instead make no changes and return a   409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that.    The optional &#x60;sandboxes&#x60; key contains a list of sandboxes that should be created or modified in conjunction with   this permissions graph update. Since data sandboxing is an Enterprise Edition-only feature, a 402 (Payment Required)   response will be returned if this key is present and the server is not running the Enterprise Edition, and/or the   &#x60;:sandboxes&#x60; feature flag is not present.    If the skip-graph query param is truthy, then the graph will not be returned.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let opts = {
  'skipGraph': false, // Boolean | 
  'force': false, // Boolean | 
  'body': {key: null} // Object | 
};
apiInstance.apiPermissionsGraphPut(opts, (error, data, response) => {
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
 **skipGraph** | **Boolean**|  | [optional] [default to false]
 **force** | **Boolean**|  | [optional] [default to false]
 **body** | **Object**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPermissionsGroupGet

> apiPermissionsGroupGet()

GET /api/permissions/group

Fetch all &#x60;PermissionsGroups&#x60;, including a count of the number of &#x60;:members&#x60; in that group.   This API requires superuser or group manager of more than one group.   Group manager is only available if &#x60;advanced-permissions&#x60; is enabled and returns only groups that user   is manager of.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
apiInstance.apiPermissionsGroupGet((error, data, response) => {
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


## apiPermissionsGroupGroupIdDelete

> apiPermissionsGroupGroupIdDelete(groupId)

DELETE /api/permissions/group/{group-id}

Delete a specific &#x60;PermissionsGroup&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let groupId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsGroupGroupIdDelete(groupId, (error, data, response) => {
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
 **groupId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPermissionsGroupGroupIdPut

> apiPermissionsGroupGroupIdPut(groupId, opts)

PUT /api/permissions/group/{group-id}

Update the name of a &#x60;PermissionsGroup&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let groupId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiPermissionsGroupPostRequest': new MetabaseApi.ApiPermissionsGroupPostRequest() // ApiPermissionsGroupPostRequest | 
};
apiInstance.apiPermissionsGroupGroupIdPut(groupId, opts, (error, data, response) => {
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
 **groupId** | **Number**| value must be an integer greater than zero. | 
 **apiPermissionsGroupPostRequest** | [**ApiPermissionsGroupPostRequest**](ApiPermissionsGroupPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPermissionsGroupIdGet

> apiPermissionsGroupIdGet(id)

GET /api/permissions/group/{id}

Fetch the details for a certain permissions group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsGroupIdGet(id, (error, data, response) => {
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


## apiPermissionsGroupPost

> apiPermissionsGroupPost(opts)

POST /api/permissions/group

Create a new &#x60;PermissionsGroup&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let opts = {
  'apiPermissionsGroupPostRequest': new MetabaseApi.ApiPermissionsGroupPostRequest() // ApiPermissionsGroupPostRequest | 
};
apiInstance.apiPermissionsGroupPost(opts, (error, data, response) => {
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
 **apiPermissionsGroupPostRequest** | [**ApiPermissionsGroupPostRequest**](ApiPermissionsGroupPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPermissionsMembershipGet

> apiPermissionsMembershipGet()

GET /api/permissions/membership

Fetch a map describing the group memberships of various users.    This map&#39;s format is:      {&lt;user-id&gt; [{:membership_id    &lt;id&gt;                  :group_id         &lt;id&gt;                  :is_group_manager boolean}]}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
apiInstance.apiPermissionsMembershipGet((error, data, response) => {
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


## apiPermissionsMembershipGroupIdClearPut

> apiPermissionsMembershipGroupIdClearPut(groupId)

PUT /api/permissions/membership/{group-id}/clear

Remove all members from a &#x60;PermissionsGroup&#x60;. Returns a 400 (Bad Request) if the group ID is for the admin group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let groupId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsMembershipGroupIdClearPut(groupId, (error, data, response) => {
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
 **groupId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPermissionsMembershipIdDelete

> apiPermissionsMembershipIdDelete(id)

DELETE /api/permissions/membership/{id}

Remove a User from a PermissionsGroup (delete their membership).

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPermissionsMembershipIdDelete(id, (error, data, response) => {
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


## apiPermissionsMembershipIdPut

> apiPermissionsMembershipIdPut(id, opts)

PUT /api/permissions/membership/{id}

Update a Permission Group membership. Returns the updated record.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiPermissionsMembershipIdPutRequest': new MetabaseApi.ApiPermissionsMembershipIdPutRequest() // ApiPermissionsMembershipIdPutRequest | 
};
apiInstance.apiPermissionsMembershipIdPut(id, opts, (error, data, response) => {
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
 **apiPermissionsMembershipIdPutRequest** | [**ApiPermissionsMembershipIdPutRequest**](ApiPermissionsMembershipIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPermissionsMembershipPost

> apiPermissionsMembershipPost(opts)

POST /api/permissions/membership

Add a &#x60;User&#x60; to a &#x60;PermissionsGroup&#x60;. Returns updated list of members belonging to the group.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPermissionsApi();
let opts = {
  'apiPermissionsMembershipPostRequest': new MetabaseApi.ApiPermissionsMembershipPostRequest() // ApiPermissionsMembershipPostRequest | 
};
apiInstance.apiPermissionsMembershipPost(opts, (error, data, response) => {
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
 **apiPermissionsMembershipPostRequest** | [**ApiPermissionsMembershipPostRequest**](ApiPermissionsMembershipPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

