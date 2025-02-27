# MetabaseApi.ApiUserApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiUserCurrentGet**](ApiUserApi.md#apiUserCurrentGet) | **GET** /api/user/current | GET /api/user/current
[**apiUserGet**](ApiUserApi.md#apiUserGet) | **GET** /api/user/ | GET /api/user/
[**apiUserIdDelete**](ApiUserApi.md#apiUserIdDelete) | **DELETE** /api/user/{id} | DELETE /api/user/{id}
[**apiUserIdGet**](ApiUserApi.md#apiUserIdGet) | **GET** /api/user/{id} | GET /api/user/{id}
[**apiUserIdModalModalPut**](ApiUserApi.md#apiUserIdModalModalPut) | **PUT** /api/user/{id}/modal/{modal} | PUT /api/user/{id}/modal/{modal}
[**apiUserIdPasswordPut**](ApiUserApi.md#apiUserIdPasswordPut) | **PUT** /api/user/{id}/password | PUT /api/user/{id}/password
[**apiUserIdPut**](ApiUserApi.md#apiUserIdPut) | **PUT** /api/user/{id} | PUT /api/user/{id}
[**apiUserIdReactivatePut**](ApiUserApi.md#apiUserIdReactivatePut) | **PUT** /api/user/{id}/reactivate | PUT /api/user/{id}/reactivate
[**apiUserPost**](ApiUserApi.md#apiUserPost) | **POST** /api/user/ | POST /api/user/
[**apiUserRecipientsGet**](ApiUserApi.md#apiUserRecipientsGet) | **GET** /api/user/recipients | GET /api/user/recipients



## apiUserCurrentGet

> apiUserCurrentGet()

GET /api/user/current

Fetch the current &#x60;User&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
apiInstance.apiUserCurrentGet((error, data, response) => {
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


## apiUserGet

> apiUserGet(opts)

GET /api/user/

Fetch a list of &#x60;Users&#x60; for admins or group managers.   By default returns only active users for admins and only active users within groups that the group manager is managing for group managers.     - If &#x60;status&#x60; is &#x60;deactivated&#x60;, include deactivated users only.    - If &#x60;status&#x60; is &#x60;all&#x60;, include all users (active and inactive).    - Also supports &#x60;include_deactivated&#x60;, which if true, is equivalent to &#x60;status&#x3D;all&#x60;; If is false, is equivalent to &#x60;status&#x3D;active&#x60;.    &#x60;status&#x60; and &#x60;include_deactivated&#x60; requires superuser permissions.    - &#x60;include_deactivated&#x60; is a legacy alias for &#x60;status&#x60; and will be removed in a future release, users are advised to use &#x60;status&#x60; for better support and flexibility.    If both params are passed, &#x60;status&#x60; takes precedence.    For users with segmented permissions, return only themselves.    Takes &#x60;limit&#x60;, &#x60;offset&#x60; for pagination.   Takes &#x60;query&#x60; for filtering on first name, last name, email.   Also takes &#x60;group_id&#x60;, which filters on group id.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let opts = {
  'status': "status_example", // String | 
  'query': "query_example", // String | 
  'groupId': 56, // Number | value must be an integer greater than zero.
  'includeDeactivated': false // Boolean | 
};
apiInstance.apiUserGet(opts, (error, data, response) => {
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
 **status** | **String**|  | [optional] 
 **query** | **String**|  | [optional] 
 **groupId** | **Number**| value must be an integer greater than zero. | [optional] 
 **includeDeactivated** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiUserIdDelete

> apiUserIdDelete(id)

DELETE /api/user/{id}

Disable a &#x60;User&#x60;.  This does not remove the &#x60;User&#x60; from the DB, but instead disables their account.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiUserIdDelete(id, (error, data, response) => {
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


## apiUserIdGet

> apiUserIdGet(id)

GET /api/user/{id}

Fetch a &#x60;User&#x60;. You must be fetching yourself *or* be a superuser *or* a Group Manager.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiUserIdGet(id, (error, data, response) => {
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


## apiUserIdModalModalPut

> apiUserIdModalModalPut(id)

PUT /api/user/{id}/modal/{modal}

Indicate that a user has been informed about the vast intricacies of &#39;the&#39; Query Builder.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiUserIdModalModalPut(id, (error, data, response) => {
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


## apiUserIdPasswordPut

> apiUserIdPasswordPut(id, opts)

PUT /api/user/{id}/password

Update a user&#39;s password.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiUserIdPasswordPutRequest': new MetabaseApi.ApiUserIdPasswordPutRequest() // ApiUserIdPasswordPutRequest | 
};
apiInstance.apiUserIdPasswordPut(id, opts, (error, data, response) => {
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
 **apiUserIdPasswordPutRequest** | [**ApiUserIdPasswordPutRequest**](ApiUserIdPasswordPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUserIdPut

> apiUserIdPut(id, opts)

PUT /api/user/{id}

Update an existing, active &#x60;User&#x60;.   Self or superusers can update user info and groups.   Group Managers can only add/remove users from groups they are manager of.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiUserIdPutRequest': new MetabaseApi.ApiUserIdPutRequest() // ApiUserIdPutRequest | 
};
apiInstance.apiUserIdPut(id, opts, (error, data, response) => {
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
 **apiUserIdPutRequest** | [**ApiUserIdPutRequest**](ApiUserIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUserIdReactivatePut

> apiUserIdReactivatePut(id)

PUT /api/user/{id}/reactivate

Reactivate user at &#x60;:id&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiUserIdReactivatePut(id, (error, data, response) => {
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


## apiUserPost

> apiUserPost(opts)

POST /api/user/

Create a new &#x60;User&#x60;, return a 400 if the email address is already taken

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
let opts = {
  'apiUserPostRequest': new MetabaseApi.ApiUserPostRequest() // ApiUserPostRequest | 
};
apiInstance.apiUserPost(opts, (error, data, response) => {
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
 **apiUserPostRequest** | [**ApiUserPostRequest**](ApiUserPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiUserRecipientsGet

> apiUserRecipientsGet()

GET /api/user/recipients

Fetch a list of &#x60;Users&#x60;. Returns only active users. Meant for non-admins unlike GET /api/user.     - If user-visibility is :all or the user is an admin, include all users.    - If user-visibility is :group, include only users in the same group (excluding the all users group).    - If user-visibility is :none or the user is sandboxed, include only themselves.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiUserApi();
apiInstance.apiUserRecipientsGet((error, data, response) => {
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

