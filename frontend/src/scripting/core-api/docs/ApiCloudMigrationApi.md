# MetabaseApi.ApiCloudMigrationApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiCloudMigrationCancelPut**](ApiCloudMigrationApi.md#apiCloudMigrationCancelPut) | **PUT** /api/cloud-migration/cancel | PUT /api/cloud-migration/cancel
[**apiCloudMigrationGet**](ApiCloudMigrationApi.md#apiCloudMigrationGet) | **GET** /api/cloud-migration/ | GET /api/cloud-migration/
[**apiCloudMigrationPost**](ApiCloudMigrationApi.md#apiCloudMigrationPost) | **POST** /api/cloud-migration/ | POST /api/cloud-migration/



## apiCloudMigrationCancelPut

> apiCloudMigrationCancelPut()

PUT /api/cloud-migration/cancel

Cancel any ongoing cloud migrations, if any.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCloudMigrationApi();
apiInstance.apiCloudMigrationCancelPut((error, data, response) => {
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


## apiCloudMigrationGet

> apiCloudMigrationGet()

GET /api/cloud-migration/

Get the latest cloud migration, if any.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCloudMigrationApi();
apiInstance.apiCloudMigrationGet((error, data, response) => {
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


## apiCloudMigrationPost

> apiCloudMigrationPost()

POST /api/cloud-migration/

Initiate a new cloud migration.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCloudMigrationApi();
apiInstance.apiCloudMigrationPost((error, data, response) => {
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

