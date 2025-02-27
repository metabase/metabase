# MetabaseApi.ApiEeAdvancedPermissionsApplicationApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeAdvancedPermissionsApplicationGraphGet**](ApiEeAdvancedPermissionsApplicationApi.md#apiEeAdvancedPermissionsApplicationGraphGet) | **GET** /api/ee/advanced-permissions/application/graph | GET /api/ee/advanced-permissions/application/graph
[**apiEeAdvancedPermissionsApplicationGraphPut**](ApiEeAdvancedPermissionsApplicationApi.md#apiEeAdvancedPermissionsApplicationGraphPut) | **PUT** /api/ee/advanced-permissions/application/graph | PUT /api/ee/advanced-permissions/application/graph



## apiEeAdvancedPermissionsApplicationGraphGet

> apiEeAdvancedPermissionsApplicationGraphGet()

GET /api/ee/advanced-permissions/application/graph

Fetch a graph of Application Permissions.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAdvancedPermissionsApplicationApi();
apiInstance.apiEeAdvancedPermissionsApplicationGraphGet((error, data, response) => {
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


## apiEeAdvancedPermissionsApplicationGraphPut

> apiEeAdvancedPermissionsApplicationGraphPut(opts)

PUT /api/ee/advanced-permissions/application/graph

Do a batch update of Application Permissions by passing a modified graph.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAdvancedPermissionsApplicationApi();
let opts = {
  'skipGraph': false, // Boolean | 
  'force': false, // Boolean | 
  'body': {key: null} // Object | 
};
apiInstance.apiEeAdvancedPermissionsApplicationGraphPut(opts, (error, data, response) => {
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

