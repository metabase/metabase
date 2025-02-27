# MetabaseApi.ApiEeAdvancedPermissionsImpersonationApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeAdvancedPermissionsImpersonationGet**](ApiEeAdvancedPermissionsImpersonationApi.md#apiEeAdvancedPermissionsImpersonationGet) | **GET** /api/ee/advanced-permissions/impersonation/ | GET /api/ee/advanced-permissions/impersonation/
[**apiEeAdvancedPermissionsImpersonationIdDelete**](ApiEeAdvancedPermissionsImpersonationApi.md#apiEeAdvancedPermissionsImpersonationIdDelete) | **DELETE** /api/ee/advanced-permissions/impersonation/{id} | DELETE /api/ee/advanced-permissions/impersonation/{id}



## apiEeAdvancedPermissionsImpersonationGet

> apiEeAdvancedPermissionsImpersonationGet(opts)

GET /api/ee/advanced-permissions/impersonation/

Fetch a list of all Impersonation policies currently in effect, or a single policy if both &#x60;group_id&#x60; and &#x60;db_id&#x60;   are provided.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAdvancedPermissionsImpersonationApi();
let opts = {
  'groupId': 56, // Number | value must be an integer greater than zero.
  'dbId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiEeAdvancedPermissionsImpersonationGet(opts, (error, data, response) => {
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
 **dbId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEeAdvancedPermissionsImpersonationIdDelete

> apiEeAdvancedPermissionsImpersonationIdDelete(id)

DELETE /api/ee/advanced-permissions/impersonation/{id}

Delete a Connection Impersonation entry.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAdvancedPermissionsImpersonationApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEeAdvancedPermissionsImpersonationIdDelete(id, (error, data, response) => {
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

