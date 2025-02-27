# MetabaseApi.ApiNotifyApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiNotifyDbAttachedDatawarehousePost**](ApiNotifyApi.md#apiNotifyDbAttachedDatawarehousePost) | **POST** /api/notify/db/attached_datawarehouse | POST /api/notify/db/attached_datawarehouse
[**apiNotifyDbIdNewTablePost**](ApiNotifyApi.md#apiNotifyDbIdNewTablePost) | **POST** /api/notify/db/{id}/new-table | POST /api/notify/db/{id}/new-table
[**apiNotifyDbIdPost**](ApiNotifyApi.md#apiNotifyDbIdPost) | **POST** /api/notify/db/{id} | POST /api/notify/db/{id}



## apiNotifyDbAttachedDatawarehousePost

> apiNotifyDbAttachedDatawarehousePost(opts)

POST /api/notify/db/attached_datawarehouse

Sync the attached datawarehouse. Can provide in the body:   - table_name and schema_name: both strings. Will look for an existing table and sync it, otherwise will try to find a   new table with that name and sync it. If it cannot find a table it will throw an error. If table_name is empty or   blank, will sync the entire database.   - synchronous?: is a boolean value to indicate if this should block on the result.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNotifyApi();
let opts = {
  'apiNotifyDbAttachedDatawarehousePostRequest': new MetabaseApi.ApiNotifyDbAttachedDatawarehousePostRequest() // ApiNotifyDbAttachedDatawarehousePostRequest | 
};
apiInstance.apiNotifyDbAttachedDatawarehousePost(opts, (error, data, response) => {
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
 **apiNotifyDbAttachedDatawarehousePostRequest** | [**ApiNotifyDbAttachedDatawarehousePostRequest**](ApiNotifyDbAttachedDatawarehousePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiNotifyDbIdNewTablePost

> apiNotifyDbIdNewTablePost(id, opts)

POST /api/notify/db/{id}/new-table

Sync a new table without running a full database sync. Requires &#x60;schema_name&#x60; and &#x60;table_name&#x60;. Will throw an error   if the table already exists in Metabase or cannot be found.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNotifyApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiNotifyDbIdNewTablePostRequest': new MetabaseApi.ApiNotifyDbIdNewTablePostRequest() // ApiNotifyDbIdNewTablePostRequest | 
};
apiInstance.apiNotifyDbIdNewTablePost(id, opts, (error, data, response) => {
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
 **apiNotifyDbIdNewTablePostRequest** | [**ApiNotifyDbIdNewTablePostRequest**](ApiNotifyDbIdNewTablePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiNotifyDbIdPost

> apiNotifyDbIdPost(id, opts)

POST /api/notify/db/{id}

Notification about a potential schema change to one of our &#x60;Databases&#x60;.   Caller can optionally specify a &#x60;:table_id&#x60; or &#x60;:table_name&#x60; in the body to limit updates to a single   &#x60;Table&#x60;. Optional Parameter &#x60;:scan&#x60; can be &#x60;\&quot;full\&quot;&#x60; or &#x60;\&quot;schema\&quot;&#x60; for a full sync or a schema sync, available   regardless if a &#x60;:table_id&#x60; or &#x60;:table_name&#x60; is passed.   This endpoint is secured by an API key that needs to be passed as a &#x60;X-METABASE-APIKEY&#x60; header which needs to be defined in   the &#x60;MB_API_KEY&#x60; [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiNotifyApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiNotifyDbIdPostRequest': new MetabaseApi.ApiNotifyDbIdPostRequest() // ApiNotifyDbIdPostRequest | 
};
apiInstance.apiNotifyDbIdPost(id, opts, (error, data, response) => {
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
 **apiNotifyDbIdPostRequest** | [**ApiNotifyDbIdPostRequest**](ApiNotifyDbIdPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

