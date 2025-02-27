# MetabaseApi.ApiPersistApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPersistCardCardIdGet**](ApiPersistApi.md#apiPersistCardCardIdGet) | **GET** /api/persist/card/{card-id} | GET /api/persist/card/{card-id}
[**apiPersistCardCardIdPersistPost**](ApiPersistApi.md#apiPersistCardCardIdPersistPost) | **POST** /api/persist/card/{card-id}/persist | POST /api/persist/card/{card-id}/persist
[**apiPersistCardCardIdRefreshPost**](ApiPersistApi.md#apiPersistCardCardIdRefreshPost) | **POST** /api/persist/card/{card-id}/refresh | POST /api/persist/card/{card-id}/refresh
[**apiPersistCardCardIdUnpersistPost**](ApiPersistApi.md#apiPersistCardCardIdUnpersistPost) | **POST** /api/persist/card/{card-id}/unpersist | POST /api/persist/card/{card-id}/unpersist
[**apiPersistDatabaseIdPersistPost**](ApiPersistApi.md#apiPersistDatabaseIdPersistPost) | **POST** /api/persist/database/{id}/persist | POST /api/persist/database/{id}/persist
[**apiPersistDatabaseIdUnpersistPost**](ApiPersistApi.md#apiPersistDatabaseIdUnpersistPost) | **POST** /api/persist/database/{id}/unpersist | POST /api/persist/database/{id}/unpersist
[**apiPersistDisablePost**](ApiPersistApi.md#apiPersistDisablePost) | **POST** /api/persist/disable | POST /api/persist/disable
[**apiPersistEnablePost**](ApiPersistApi.md#apiPersistEnablePost) | **POST** /api/persist/enable | POST /api/persist/enable
[**apiPersistGet**](ApiPersistApi.md#apiPersistGet) | **GET** /api/persist/ | GET /api/persist/
[**apiPersistPersistedInfoIdGet**](ApiPersistApi.md#apiPersistPersistedInfoIdGet) | **GET** /api/persist/{persisted-info-id} | GET /api/persist/{persisted-info-id}
[**apiPersistSetRefreshSchedulePost**](ApiPersistApi.md#apiPersistSetRefreshSchedulePost) | **POST** /api/persist/set-refresh-schedule | POST /api/persist/set-refresh-schedule



## apiPersistCardCardIdGet

> apiPersistCardCardIdGet(cardId)

GET /api/persist/card/{card-id}

Fetch a particular [[PersistedInfo]] by card-id.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistCardCardIdGet(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPersistCardCardIdPersistPost

> apiPersistCardCardIdPersistPost(cardId)

POST /api/persist/card/{card-id}/persist

Mark the model (card) as persisted. Runs the query and saves it to the database backing the card and hot swaps this   query in place of the model&#39;s query.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistCardCardIdPersistPost(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPersistCardCardIdRefreshPost

> apiPersistCardCardIdRefreshPost(cardId)

POST /api/persist/card/{card-id}/refresh

Refresh the persisted model caching &#x60;card-id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistCardCardIdRefreshPost(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPersistCardCardIdUnpersistPost

> apiPersistCardCardIdUnpersistPost(cardId)

POST /api/persist/card/{card-id}/unpersist

Unpersist this model. Deletes the persisted table backing the model and all queries after this will use the card&#39;s   query rather than the saved version of the query.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistCardCardIdUnpersistPost(cardId, (error, data, response) => {
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
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPersistDatabaseIdPersistPost

> apiPersistDatabaseIdPersistPost(id)

POST /api/persist/database/{id}/persist

Attempt to enable model persistence for a database. If already enabled returns a generic 204.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistDatabaseIdPersistPost(id, (error, data, response) => {
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


## apiPersistDatabaseIdUnpersistPost

> apiPersistDatabaseIdUnpersistPost(id)

POST /api/persist/database/{id}/unpersist

Attempt to disable model persistence for a database. If already not enabled, just returns a generic 204.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistDatabaseIdUnpersistPost(id, (error, data, response) => {
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


## apiPersistDisablePost

> apiPersistDisablePost()

POST /api/persist/disable

Disable global setting to allow databases to persist models. This will remove all tasks to refresh tables, remove   that option from databases which might have it enabled, and delete all cached tables.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
apiInstance.apiPersistDisablePost((error, data, response) => {
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


## apiPersistEnablePost

> apiPersistEnablePost()

POST /api/persist/enable

Enable global setting to allow databases to persist models.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
apiInstance.apiPersistEnablePost((error, data, response) => {
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


## apiPersistGet

> apiPersistGet()

GET /api/persist/

List the entries of [[PersistedInfo]] in order to show a status page.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
apiInstance.apiPersistGet((error, data, response) => {
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


## apiPersistPersistedInfoIdGet

> apiPersistPersistedInfoIdGet(persistedInfoId)

GET /api/persist/{persisted-info-id}

Fetch a particular [[PersistedInfo]] by id.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let persistedInfoId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPersistPersistedInfoIdGet(persistedInfoId, (error, data, response) => {
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
 **persistedInfoId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPersistSetRefreshSchedulePost

> apiPersistSetRefreshSchedulePost(opts)

POST /api/persist/set-refresh-schedule

Set the cron schedule to refresh persisted models.    Shape should be JSON like {cron: \&quot;0 30 1/8 * * ? *\&quot;}.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPersistApi();
let opts = {
  'apiPersistSetRefreshSchedulePostRequest': new MetabaseApi.ApiPersistSetRefreshSchedulePostRequest() // ApiPersistSetRefreshSchedulePostRequest | 
};
apiInstance.apiPersistSetRefreshSchedulePost(opts, (error, data, response) => {
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
 **apiPersistSetRefreshSchedulePostRequest** | [**ApiPersistSetRefreshSchedulePostRequest**](ApiPersistSetRefreshSchedulePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

