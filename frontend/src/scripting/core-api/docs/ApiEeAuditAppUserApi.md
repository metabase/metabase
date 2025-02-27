# MetabaseApi.ApiEeAuditAppUserApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEeAuditAppUserAuditInfoGet**](ApiEeAuditAppUserApi.md#apiEeAuditAppUserAuditInfoGet) | **GET** /api/ee/audit-app/user/audit-info | GET /api/ee/audit-app/user/audit-info
[**apiEeAuditAppUserIdSubscriptionsDelete**](ApiEeAuditAppUserApi.md#apiEeAuditAppUserIdSubscriptionsDelete) | **DELETE** /api/ee/audit-app/user/{id}/subscriptions | DELETE /api/ee/audit-app/user/{id}/subscriptions



## apiEeAuditAppUserAuditInfoGet

> apiEeAuditAppUserAuditInfoGet()

GET /api/ee/audit-app/user/audit-info

Gets audit info for the current user if he has permissions to access the audit collection.   Otherwise return an empty map.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAuditAppUserApi();
apiInstance.apiEeAuditAppUserAuditInfoGet((error, data, response) => {
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


## apiEeAuditAppUserIdSubscriptionsDelete

> apiEeAuditAppUserIdSubscriptionsDelete(id)

DELETE /api/ee/audit-app/user/{id}/subscriptions

Delete all Alert and DashboardSubscription subscriptions for a User (i.e., so they will no longer receive them).   Archive all Alerts and DashboardSubscriptions created by the User. Only allowed for admins or for the current user.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEeAuditAppUserApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEeAuditAppUserIdSubscriptionsDelete(id, (error, data, response) => {
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

