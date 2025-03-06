# MetabaseApi.ApiTableApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiTableCardIdFksGet**](ApiTableApi.md#apiTableCardIdFksGet) | **GET** /api/table/card__:id/fks | GET /api/table/card__:id/fks
[**apiTableCardIdQueryMetadataGet**](ApiTableApi.md#apiTableCardIdQueryMetadataGet) | **GET** /api/table/card__:id/query_metadata | GET /api/table/card__:id/query_metadata
[**apiTableGet**](ApiTableApi.md#apiTableGet) | **GET** /api/table/ | GET /api/table/
[**apiTableIdAppendCsvPost**](ApiTableApi.md#apiTableIdAppendCsvPost) | **POST** /api/table/{id}/append-csv | POST /api/table/{id}/append-csv
[**apiTableIdDiscardValuesPost**](ApiTableApi.md#apiTableIdDiscardValuesPost) | **POST** /api/table/{id}/discard_values | POST /api/table/{id}/discard_values
[**apiTableIdFieldsOrderPut**](ApiTableApi.md#apiTableIdFieldsOrderPut) | **PUT** /api/table/{id}/fields/order | PUT /api/table/{id}/fields/order
[**apiTableIdFksGet**](ApiTableApi.md#apiTableIdFksGet) | **GET** /api/table/{id}/fks | GET /api/table/{id}/fks
[**apiTableIdGet**](ApiTableApi.md#apiTableIdGet) | **GET** /api/table/{id} | GET /api/table/{id}
[**apiTableIdPut**](ApiTableApi.md#apiTableIdPut) | **PUT** /api/table/{id} | PUT /api/table/{id}
[**apiTableIdQueryMetadataGet**](ApiTableApi.md#apiTableIdQueryMetadataGet) | **GET** /api/table/{id}/query_metadata | GET /api/table/{id}/query_metadata
[**apiTableIdRelatedGet**](ApiTableApi.md#apiTableIdRelatedGet) | **GET** /api/table/{id}/related | GET /api/table/{id}/related
[**apiTableIdReplaceCsvPost**](ApiTableApi.md#apiTableIdReplaceCsvPost) | **POST** /api/table/{id}/replace-csv | POST /api/table/{id}/replace-csv
[**apiTableIdRescanValuesPost**](ApiTableApi.md#apiTableIdRescanValuesPost) | **POST** /api/table/{id}/rescan_values | POST /api/table/{id}/rescan_values
[**apiTablePut**](ApiTableApi.md#apiTablePut) | **PUT** /api/table/ | PUT /api/table/



## apiTableCardIdFksGet

> apiTableCardIdFksGet(id)

GET /api/table/card__:id/fks

Return FK info for the &#39;virtual&#39; table for a Card. This is always empty, so this endpoint    serves mainly as a placeholder to avoid having to change anything on the frontend.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableCardIdFksGet(id, (error, data, response) => {
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


## apiTableCardIdQueryMetadataGet

> apiTableCardIdQueryMetadataGet(id)

GET /api/table/card__:id/query_metadata

Return metadata for the &#39;virtual&#39; table for a Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableCardIdQueryMetadataGet(id, (error, data, response) => {
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


## apiTableGet

> apiTableGet()

GET /api/table/

Get all &#x60;Tables&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
apiInstance.apiTableGet((error, data, response) => {
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


## apiTableIdAppendCsvPost

> apiTableIdAppendCsvPost(id, file)

POST /api/table/{id}/append-csv

Inserts the rows of an uploaded CSV file into the table identified by &#x60;:id&#x60;. The table must have been created by   uploading a CSV file.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let file = new MetabaseApi.ApiCardFromCsvPostRequestFile(); // ApiCardFromCsvPostRequestFile | 
apiInstance.apiTableIdAppendCsvPost(id, file, (error, data, response) => {
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
 **file** | [**ApiCardFromCsvPostRequestFile**](ApiCardFromCsvPostRequestFile.md)|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: Not defined


## apiTableIdDiscardValuesPost

> apiTableIdDiscardValuesPost(id)

POST /api/table/{id}/discard_values

Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If    this Table&#39;s Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableIdDiscardValuesPost(id, (error, data, response) => {
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


## apiTableIdFieldsOrderPut

> apiTableIdFieldsOrderPut(id, opts)

PUT /api/table/{id}/fields/order

Reorder fields

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'requestBody': [null] // [Number] | 
};
apiInstance.apiTableIdFieldsOrderPut(id, opts, (error, data, response) => {
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
 **requestBody** | [**[Number]**](Number.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTableIdFksGet

> apiTableIdFksGet(id)

GET /api/table/{id}/fks

Get all foreign keys whose destination is a &#x60;Field&#x60; that belongs to this &#x60;Table&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableIdFksGet(id, (error, data, response) => {
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


## apiTableIdGet

> apiTableIdGet(id, opts)

GET /api/table/{id}

Get &#x60;Table&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeEditableDataModel': true // Boolean | 
};
apiInstance.apiTableIdGet(id, opts, (error, data, response) => {
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
 **includeEditableDataModel** | **Boolean**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTableIdPut

> apiTableIdPut(id, opts)

PUT /api/table/{id}

Update &#x60;Table&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiTableIdPutRequest': new MetabaseApi.ApiTableIdPutRequest() // ApiTableIdPutRequest | 
};
apiInstance.apiTableIdPut(id, opts, (error, data, response) => {
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
 **apiTableIdPutRequest** | [**ApiTableIdPutRequest**](ApiTableIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiTableIdQueryMetadataGet

> apiTableIdQueryMetadataGet(id, opts)

GET /api/table/{id}/query_metadata

Get metadata about a &#x60;Table&#x60; useful for running queries.    Returns DB, fields, field FKs, and field values.     Passing &#x60;include_hidden_fields&#x3D;true&#x60; will include any hidden &#x60;Fields&#x60; in the response. Defaults to &#x60;false&#x60;    Passing &#x60;include_sensitive_fields&#x3D;true&#x60; will include any sensitive &#x60;Fields&#x60; in the response. Defaults to &#x60;false&#x60;.     Passing &#x60;include_editable_data_model&#x3D;true&#x60; will check that the current user has write permissions for the table&#39;s    data model, while &#x60;false&#x60; checks that they have data access perms for the table. Defaults to &#x60;false&#x60;.     These options are provided for use in the Admin Edit Metadata page.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeSensitiveFields': false, // Boolean | 
  'includeHiddenFields': false, // Boolean | 
  'includeEditableDataModel': false // Boolean | 
};
apiInstance.apiTableIdQueryMetadataGet(id, opts, (error, data, response) => {
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
 **includeSensitiveFields** | **Boolean**|  | [optional] [default to false]
 **includeHiddenFields** | **Boolean**|  | [optional] [default to false]
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiTableIdRelatedGet

> apiTableIdRelatedGet(id)

GET /api/table/{id}/related

Return related entities.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableIdRelatedGet(id, (error, data, response) => {
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


## apiTableIdReplaceCsvPost

> apiTableIdReplaceCsvPost(id, file)

POST /api/table/{id}/replace-csv

Replaces the contents of the table identified by &#x60;:id&#x60; with the rows of an uploaded CSV file. The table must have   been created by uploading a CSV file.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
let file = new MetabaseApi.ApiCardFromCsvPostRequestFile(); // ApiCardFromCsvPostRequestFile | 
apiInstance.apiTableIdReplaceCsvPost(id, file, (error, data, response) => {
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
 **file** | [**ApiCardFromCsvPostRequestFile**](ApiCardFromCsvPostRequestFile.md)|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: Not defined


## apiTableIdRescanValuesPost

> apiTableIdRescanValuesPost(id)

POST /api/table/{id}/rescan_values

Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that    are eligible for FieldValues.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiTableIdRescanValuesPost(id, (error, data, response) => {
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


## apiTablePut

> apiTablePut(opts)

PUT /api/table/

Update all &#x60;Table&#x60; in &#x60;ids&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiTableApi();
let opts = {
  'apiTablePutRequest': new MetabaseApi.ApiTablePutRequest() // ApiTablePutRequest | 
};
apiInstance.apiTablePut(opts, (error, data, response) => {
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
 **apiTablePutRequest** | [**ApiTablePutRequest**](ApiTablePutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

