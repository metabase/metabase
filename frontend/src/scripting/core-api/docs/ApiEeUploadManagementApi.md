# MetabaseApi.ApiEeUploadManagementApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeUploadManagementTablesGet**](ApiEeUploadManagementApi.md#apiEeUploadManagementTablesGet) | **GET** /api/ee/upload-management/tables | GET /api/ee/upload-management/tables
[**apiEeUploadManagementTablesIdDelete**](ApiEeUploadManagementApi.md#apiEeUploadManagementTablesIdDelete) | **DELETE** /api/ee/upload-management/tables/{id} | DELETE /api/ee/upload-management/tables/{id}



## apiEeUploadManagementTablesGet

> apiEeUploadManagementTablesGet()

GET /api/ee/upload-management/tables

Get all &#x60;Tables&#x60; visible to the current user which were created by uploading a file.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeUploadManagementApi();
apiInstance.apiEeUploadManagementTablesGet((error, data, response) => {
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


## apiEeUploadManagementTablesIdDelete

> apiEeUploadManagementTablesIdDelete(id, opts)

DELETE /api/ee/upload-management/tables/{id}

Delete the uploaded table from the database, optionally archiving cards for which it is the primary source.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeUploadManagementApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'archiveCards': false // Boolean | 
};
apiInstance.apiEeUploadManagementTablesIdDelete(id, opts, (error, data, response) => {
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
 **archiveCards** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

