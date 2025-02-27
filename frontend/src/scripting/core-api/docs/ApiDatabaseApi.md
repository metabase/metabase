# MetabaseApi.ApiDatabaseApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiDatabaseGet**](ApiDatabaseApi.md#apiDatabaseGet) | **GET** /api/database/ | GET /api/database/
[**apiDatabaseIdAutocompleteSuggestionsGet**](ApiDatabaseApi.md#apiDatabaseIdAutocompleteSuggestionsGet) | **GET** /api/database/{id}/autocomplete_suggestions | GET /api/database/{id}/autocomplete_suggestions
[**apiDatabaseIdCardAutocompleteSuggestionsGet**](ApiDatabaseApi.md#apiDatabaseIdCardAutocompleteSuggestionsGet) | **GET** /api/database/{id}/card_autocomplete_suggestions | GET /api/database/{id}/card_autocomplete_suggestions
[**apiDatabaseIdDelete**](ApiDatabaseApi.md#apiDatabaseIdDelete) | **DELETE** /api/database/{id} | DELETE /api/database/{id}
[**apiDatabaseIdDiscardValuesPost**](ApiDatabaseApi.md#apiDatabaseIdDiscardValuesPost) | **POST** /api/database/{id}/discard_values | POST /api/database/{id}/discard_values
[**apiDatabaseIdDismissSpinnerPost**](ApiDatabaseApi.md#apiDatabaseIdDismissSpinnerPost) | **POST** /api/database/{id}/dismiss_spinner | POST /api/database/{id}/dismiss_spinner
[**apiDatabaseIdFieldsGet**](ApiDatabaseApi.md#apiDatabaseIdFieldsGet) | **GET** /api/database/{id}/fields | GET /api/database/{id}/fields
[**apiDatabaseIdGet**](ApiDatabaseApi.md#apiDatabaseIdGet) | **GET** /api/database/{id} | GET /api/database/{id}
[**apiDatabaseIdIdfieldsGet**](ApiDatabaseApi.md#apiDatabaseIdIdfieldsGet) | **GET** /api/database/{id}/idfields | GET /api/database/{id}/idfields
[**apiDatabaseIdMetadataGet**](ApiDatabaseApi.md#apiDatabaseIdMetadataGet) | **GET** /api/database/{id}/metadata | GET /api/database/{id}/metadata
[**apiDatabaseIdPut**](ApiDatabaseApi.md#apiDatabaseIdPut) | **PUT** /api/database/{id} | PUT /api/database/{id}
[**apiDatabaseIdRescanValuesPost**](ApiDatabaseApi.md#apiDatabaseIdRescanValuesPost) | **POST** /api/database/{id}/rescan_values | POST /api/database/{id}/rescan_values
[**apiDatabaseIdSchemaGet**](ApiDatabaseApi.md#apiDatabaseIdSchemaGet) | **GET** /api/database/{id}/schema/ | GET /api/database/{id}/schema/
[**apiDatabaseIdSchemaSchemaGet**](ApiDatabaseApi.md#apiDatabaseIdSchemaSchemaGet) | **GET** /api/database/{id}/schema/{schema} | GET /api/database/{id}/schema/{schema}
[**apiDatabaseIdSchemasGet**](ApiDatabaseApi.md#apiDatabaseIdSchemasGet) | **GET** /api/database/{id}/schemas | GET /api/database/{id}/schemas
[**apiDatabaseIdSyncSchemaPost**](ApiDatabaseApi.md#apiDatabaseIdSyncSchemaPost) | **POST** /api/database/{id}/sync_schema | POST /api/database/{id}/sync_schema
[**apiDatabaseIdSyncableSchemasGet**](ApiDatabaseApi.md#apiDatabaseIdSyncableSchemasGet) | **GET** /api/database/{id}/syncable_schemas | GET /api/database/{id}/syncable_schemas
[**apiDatabaseIdUsageInfoGet**](ApiDatabaseApi.md#apiDatabaseIdUsageInfoGet) | **GET** /api/database/{id}/usage_info | GET /api/database/{id}/usage_info
[**apiDatabasePost**](ApiDatabaseApi.md#apiDatabasePost) | **POST** /api/database/ | POST /api/database/
[**apiDatabaseSampleDatabasePost**](ApiDatabaseApi.md#apiDatabaseSampleDatabasePost) | **POST** /api/database/sample_database | POST /api/database/sample_database
[**apiDatabaseValidatePost**](ApiDatabaseApi.md#apiDatabaseValidatePost) | **POST** /api/database/validate | POST /api/database/validate
[**apiDatabaseVirtualDbDatasetsGet**](ApiDatabaseApi.md#apiDatabaseVirtualDbDatasetsGet) | **GET** /api/database/{virtual-db}/datasets | GET /api/database/{virtual-db}/datasets
[**apiDatabaseVirtualDbDatasetsSchemaGet**](ApiDatabaseApi.md#apiDatabaseVirtualDbDatasetsSchemaGet) | **GET** /api/database/{virtual-db}/datasets/{schema} | GET /api/database/{virtual-db}/datasets/{schema}
[**apiDatabaseVirtualDbMetadataGet**](ApiDatabaseApi.md#apiDatabaseVirtualDbMetadataGet) | **GET** /api/database/{virtual-db}/metadata | GET /api/database/{virtual-db}/metadata
[**apiDatabaseVirtualDbSchemaSchemaGet**](ApiDatabaseApi.md#apiDatabaseVirtualDbSchemaSchemaGet) | **GET** /api/database/{virtual-db}/schema/{schema} | GET /api/database/{virtual-db}/schema/{schema}
[**apiDatabaseVirtualDbSchemasGet**](ApiDatabaseApi.md#apiDatabaseVirtualDbSchemasGet) | **GET** /api/database/{virtual-db}/schemas | GET /api/database/{virtual-db}/schemas



## apiDatabaseGet

> apiDatabaseGet(opts)

GET /api/database/

Fetch all &#x60;Databases&#x60;.    * &#x60;include&#x3D;tables&#x60; means we should hydrate the Tables belonging to each DB. Default: &#x60;false&#x60;.    * &#x60;saved&#x60; means we should include the saved questions virtual database. Default: &#x60;false&#x60;.    * &#x60;include_editable_data_model&#x60; will only include DBs for which the current user has data model editing     permissions. (If &#x60;include&#x3D;tables&#x60;, this also applies to the list of tables in each DB). Should only be used if     Enterprise Edition code is available the advanced-permissions feature is enabled.    * &#x60;exclude_uneditable_details&#x60; will only include DBs for which the current user can edit the DB details. Has no     effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled.    * &#x60;include_only_uploadable&#x60; will only include DBs into which Metabase can insert new data.    Independently of these flags, the implementation of [[metabase.models.interface/to-json]] for &#x60;:model/Database&#x60; in   [[metabase.models.database]] uses the implementation of [[metabase.models.interface/can-write?]] for &#x60;:model/Database&#x60;   in [[metabase.models.database]] to exclude the &#x60;details&#x60; field, if the requesting user lacks permission to change the   database details.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let opts = {
  'include': null, // Object | include must be either empty or the value tables
  'includeAnalytics': false, // Boolean | 
  'saved': false, // Boolean | 
  'includeEditableDataModel': false, // Boolean | 
  'excludeUneditableDetails': false, // Boolean | 
  'includeOnlyUploadable': false // Boolean | 
};
apiInstance.apiDatabaseGet(opts, (error, data, response) => {
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
 **include** | [**Object**](.md)| include must be either empty or the value tables | [optional] 
 **includeAnalytics** | **Boolean**|  | [optional] [default to false]
 **saved** | **Boolean**|  | [optional] [default to false]
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]
 **excludeUneditableDetails** | **Boolean**|  | [optional] [default to false]
 **includeOnlyUploadable** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdAutocompleteSuggestionsGet

> apiDatabaseIdAutocompleteSuggestionsGet(id, opts)

GET /api/database/{id}/autocomplete_suggestions

Return a list of autocomplete suggestions for a given &#x60;prefix&#x60;, or &#x60;substring&#x60;. Should only specify one, but   &#x60;substring&#x60; will have priority if both are present.    This is intended for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching &#x60;Tables&#x60;   and &#x60;Fields&#x60; in this &#x60;Database&#x60;.    Tables are returned in the format &#x60;[table_name \&quot;Table\&quot;]&#x60;;   When Fields have a semantic_type, they are returned in the format &#x60;[field_name \&quot;table_name base_type semantic_type\&quot;]&#x60;   When Fields lack a semantic_type, they are returned in the format &#x60;[field_name \&quot;table_name base_type\&quot;]&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'prefix': "prefix_example", // String | value must be a non-blank string.
  'substring': "substring_example" // String | value must be a non-blank string.
};
apiInstance.apiDatabaseIdAutocompleteSuggestionsGet(id, opts, (error, data, response) => {
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
 **prefix** | **String**| value must be a non-blank string. | [optional] 
 **substring** | **String**| value must be a non-blank string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdCardAutocompleteSuggestionsGet

> apiDatabaseIdCardAutocompleteSuggestionsGet(id, query, opts)

GET /api/database/{id}/card_autocomplete_suggestions

Return a list of &#x60;Card&#x60; autocomplete suggestions for a given &#x60;query&#x60; in a given &#x60;Database&#x60;.    This is intended for use with the ACE Editor when the User is typing in a template tag for a &#x60;Card&#x60;, e.g. {{#...}}.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let query = "query_example"; // String | value must be a non-blank string.
let opts = {
  'includeDashboardQuestions': true // Boolean | 
};
apiInstance.apiDatabaseIdCardAutocompleteSuggestionsGet(id, query, opts, (error, data, response) => {
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
 **query** | **String**| value must be a non-blank string. | 
 **includeDashboardQuestions** | **Boolean**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdDelete

> apiDatabaseIdDelete(id)

DELETE /api/database/{id}

Delete a &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdDelete(id, (error, data, response) => {
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


## apiDatabaseIdDiscardValuesPost

> apiDatabaseIdDiscardValuesPost(id)

POST /api/database/{id}/discard_values

Discards all saved field values for this &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdDiscardValuesPost(id, (error, data, response) => {
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


## apiDatabaseIdDismissSpinnerPost

> apiDatabaseIdDismissSpinnerPost(id)

POST /api/database/{id}/dismiss_spinner

Manually set the initial sync status of the &#x60;Database&#x60; and corresponding   tables to be &#x60;complete&#x60; (see #20863)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdDismissSpinnerPost(id, (error, data, response) => {
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


## apiDatabaseIdFieldsGet

> apiDatabaseIdFieldsGet(id)

GET /api/database/{id}/fields

Get a list of all &#x60;Fields&#x60; in &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdFieldsGet(id, (error, data, response) => {
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


## apiDatabaseIdGet

> apiDatabaseIdGet(id, opts)

GET /api/database/{id}

Get a single Database with &#x60;id&#x60;. Optionally pass &#x60;?include&#x3D;tables&#x60; or &#x60;?include&#x3D;tables.fields&#x60; to include the Tables    belonging to this database, or the Tables and Fields, respectively.  If the requestor has write permissions for the DB    (i.e. is an admin or has data model permissions), then certain inferred secret values will also be included in the    returned details (see [[metabase.models.secret/expand-db-details-inferred-secret-values]] for full details).     Passing include_editable_data_model will only return tables for which the current user has data model editing    permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.    In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID    and tables, with no additional metadata.     Independently of these flags, the implementation of [[metabase.models.interface/to-json]] for &#x60;:model/Database&#x60; in    [[metabase.models.database]] uses the implementation of [[metabase.models.interface/can-write?]] for &#x60;:model/Database&#x60;    in [[metabase.models.database]] to exclude the &#x60;details&#x60; field, if the requesting user lacks permission to change the    database details.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'include': "include_example" // String | 
};
apiInstance.apiDatabaseIdGet(id, opts, (error, data, response) => {
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
 **include** | **String**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdIdfieldsGet

> apiDatabaseIdIdfieldsGet(id)

GET /api/database/{id}/idfields

Get a list of all primary key &#x60;Fields&#x60; for &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdIdfieldsGet(id, (error, data, response) => {
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


## apiDatabaseIdMetadataGet

> apiDatabaseIdMetadataGet(id, opts)

GET /api/database/{id}/metadata

Get metadata about a &#x60;Database&#x60;, including all of its &#x60;Tables&#x60; and &#x60;Fields&#x60;. Returns DB, fields, and field values.   By default only non-hidden tables and fields are returned. Passing include_hidden&#x3D;true includes them.    Passing include_editable_data_model will only return tables for which the current user has data model editing   permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.   In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID   and tables, with no additional metadata.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeHidden': false, // Boolean | 
  'includeEditableDataModel': false, // Boolean | 
  'removeInactive': false, // Boolean | 
  'skipFields': false // Boolean | 
};
apiInstance.apiDatabaseIdMetadataGet(id, opts, (error, data, response) => {
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
 **includeHidden** | **Boolean**|  | [optional] [default to false]
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]
 **removeInactive** | **Boolean**|  | [optional] [default to false]
 **skipFields** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdPut

> apiDatabaseIdPut(id, opts)

PUT /api/database/{id}

Update a &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDatabaseIdPutRequest': new MetabaseApi.ApiDatabaseIdPutRequest() // ApiDatabaseIdPutRequest | 
};
apiInstance.apiDatabaseIdPut(id, opts, (error, data, response) => {
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
 **apiDatabaseIdPutRequest** | [**ApiDatabaseIdPutRequest**](ApiDatabaseIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatabaseIdRescanValuesPost

> apiDatabaseIdRescanValuesPost(id)

POST /api/database/{id}/rescan_values

Trigger a manual scan of the field values for this &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdRescanValuesPost(id, (error, data, response) => {
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


## apiDatabaseIdSchemaGet

> apiDatabaseIdSchemaGet(id, opts)

GET /api/database/{id}/schema/

Return a list of Tables for a Database whose &#x60;schema&#x60; is &#x60;nil&#x60; or an empty string.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeHidden': false, // Boolean | 
  'includeEditableDataModel': false // Boolean | 
};
apiInstance.apiDatabaseIdSchemaGet(id, opts, (error, data, response) => {
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
 **includeHidden** | **Boolean**|  | [optional] [default to false]
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdSchemaSchemaGet

> apiDatabaseIdSchemaSchemaGet(id, opts)

GET /api/database/{id}/schema/{schema}

Returns a list of Tables for the given Database &#x60;id&#x60; and &#x60;schema&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeHidden': false, // Boolean | 
  'includeEditableDataModel': false // Boolean | 
};
apiInstance.apiDatabaseIdSchemaSchemaGet(id, opts, (error, data, response) => {
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
 **includeHidden** | **Boolean**|  | [optional] [default to false]
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdSchemasGet

> apiDatabaseIdSchemasGet(id, opts)

GET /api/database/{id}/schemas

Returns a list of all the schemas with tables found for the database &#x60;id&#x60;. Excludes schemas with no tables.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'includeEditableDataModel': false, // Boolean | 
  'includeHidden': false // Boolean | 
};
apiInstance.apiDatabaseIdSchemasGet(id, opts, (error, data, response) => {
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
 **includeEditableDataModel** | **Boolean**|  | [optional] [default to false]
 **includeHidden** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiDatabaseIdSyncSchemaPost

> apiDatabaseIdSyncSchemaPost(id)

POST /api/database/{id}/sync_schema

Trigger a manual update of the schema metadata for this &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdSyncSchemaPost(id, (error, data, response) => {
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


## apiDatabaseIdSyncableSchemasGet

> apiDatabaseIdSyncableSchemasGet(id)

GET /api/database/{id}/syncable_schemas

Returns a list of all syncable schemas found for the database &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdSyncableSchemasGet(id, (error, data, response) => {
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


## apiDatabaseIdUsageInfoGet

> apiDatabaseIdUsageInfoGet(id)

GET /api/database/{id}/usage_info

Get usage info for a database.   Returns a map with keys are models and values are the number of entities that use this database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiDatabaseIdUsageInfoGet(id, (error, data, response) => {
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


## apiDatabasePost

> apiDatabasePost(opts)

POST /api/database/

Add a new &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let opts = {
  'apiDatabasePostRequest': new MetabaseApi.ApiDatabasePostRequest() // ApiDatabasePostRequest | 
};
apiInstance.apiDatabasePost(opts, (error, data, response) => {
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
 **apiDatabasePostRequest** | [**ApiDatabasePostRequest**](ApiDatabasePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatabaseSampleDatabasePost

> apiDatabaseSampleDatabasePost()

POST /api/database/sample_database

Add the sample database as a new &#x60;Database&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseSampleDatabasePost((error, data, response) => {
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


## apiDatabaseValidatePost

> apiDatabaseValidatePost(opts)

POST /api/database/validate

Validate that we can connect to a database given a set of details.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
let opts = {
  'apiDatabaseValidatePostRequest': new MetabaseApi.ApiDatabaseValidatePostRequest() // ApiDatabaseValidatePostRequest | 
};
apiInstance.apiDatabaseValidatePost(opts, (error, data, response) => {
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
 **apiDatabaseValidatePostRequest** | [**ApiDatabaseValidatePostRequest**](ApiDatabaseValidatePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiDatabaseVirtualDbDatasetsGet

> apiDatabaseVirtualDbDatasetsGet()

GET /api/database/{virtual-db}/datasets

Returns a list of all the datasets found for the saved questions virtual database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseVirtualDbDatasetsGet((error, data, response) => {
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


## apiDatabaseVirtualDbDatasetsSchemaGet

> apiDatabaseVirtualDbDatasetsSchemaGet()

GET /api/database/{virtual-db}/datasets/{schema}

Returns a list of Tables for the datasets virtual database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseVirtualDbDatasetsSchemaGet((error, data, response) => {
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


## apiDatabaseVirtualDbMetadataGet

> apiDatabaseVirtualDbMetadataGet()

GET /api/database/{virtual-db}/metadata

Endpoint that provides metadata for the Saved Questions &#39;virtual&#39; database. Used for fooling the frontend    and allowing it to treat the Saved Questions virtual DB just like any other database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseVirtualDbMetadataGet((error, data, response) => {
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


## apiDatabaseVirtualDbSchemaSchemaGet

> apiDatabaseVirtualDbSchemaSchemaGet()

GET /api/database/{virtual-db}/schema/{schema}

Returns a list of Tables for the saved questions virtual database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseVirtualDbSchemaSchemaGet((error, data, response) => {
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


## apiDatabaseVirtualDbSchemasGet

> apiDatabaseVirtualDbSchemasGet()

GET /api/database/{virtual-db}/schemas

Returns a list of all the schemas found for the saved questions virtual database.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiDatabaseApi();
apiInstance.apiDatabaseVirtualDbSchemasGet((error, data, response) => {
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

