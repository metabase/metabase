# MetabaseApi.ApiPublicApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPublicActionUuidExecutePost**](ApiPublicApi.md#apiPublicActionUuidExecutePost) | **POST** /api/public/action/{uuid}/execute | POST /api/public/action/{uuid}/execute
[**apiPublicActionUuidGet**](ApiPublicApi.md#apiPublicActionUuidGet) | **GET** /api/public/action/{uuid} | GET /api/public/action/{uuid}
[**apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet**](ApiPublicApi.md#apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet) | **GET** /api/public/card/{uuid}/field/{field-id}/remapping/{remapped-id} | GET /api/public/card/{uuid}/field/{field-id}/remapping/{remapped-id}
[**apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet**](ApiPublicApi.md#apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet) | **GET** /api/public/card/{uuid}/field/{field-id}/search/{search-field-id} | GET /api/public/card/{uuid}/field/{field-id}/search/{search-field-id}
[**apiPublicCardUuidFieldFieldIdValuesGet**](ApiPublicApi.md#apiPublicCardUuidFieldFieldIdValuesGet) | **GET** /api/public/card/{uuid}/field/{field-id}/values | GET /api/public/card/{uuid}/field/{field-id}/values
[**apiPublicCardUuidGet**](ApiPublicApi.md#apiPublicCardUuidGet) | **GET** /api/public/card/{uuid} | GET /api/public/card/{uuid}
[**apiPublicCardUuidParamsParamKeySearchQueryGet**](ApiPublicApi.md#apiPublicCardUuidParamsParamKeySearchQueryGet) | **GET** /api/public/card/{uuid}/params/{param-key}/search/{query} | GET /api/public/card/{uuid}/params/{param-key}/search/{query}
[**apiPublicCardUuidParamsParamKeyValuesGet**](ApiPublicApi.md#apiPublicCardUuidParamsParamKeyValuesGet) | **GET** /api/public/card/{uuid}/params/{param-key}/values | GET /api/public/card/{uuid}/params/{param-key}/values
[**apiPublicCardUuidQueryExportFormatGet**](ApiPublicApi.md#apiPublicCardUuidQueryExportFormatGet) | **GET** /api/public/card/{uuid}/query/{export-format} | GET /api/public/card/{uuid}/query/{export-format}
[**apiPublicCardUuidQueryGet**](ApiPublicApi.md#apiPublicCardUuidQueryGet) | **GET** /api/public/card/{uuid}/query | GET /api/public/card/{uuid}/query
[**apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost**](ApiPublicApi.md#apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost) | **POST** /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}/{export-format} | POST /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}/{export-format}
[**apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet**](ApiPublicApi.md#apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet) | **GET** /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id} | GET /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}
[**apiPublicDashboardUuidDashcardDashcardIdExecuteGet**](ApiPublicApi.md#apiPublicDashboardUuidDashcardDashcardIdExecuteGet) | **GET** /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute | GET /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute
[**apiPublicDashboardUuidDashcardDashcardIdExecutePost**](ApiPublicApi.md#apiPublicDashboardUuidDashcardDashcardIdExecutePost) | **POST** /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute | POST /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute
[**apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet**](ApiPublicApi.md#apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet) | **GET** /api/public/dashboard/{uuid}/field/{field-id}/remapping/{remapped-id} | GET /api/public/dashboard/{uuid}/field/{field-id}/remapping/{remapped-id}
[**apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet**](ApiPublicApi.md#apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet) | **GET** /api/public/dashboard/{uuid}/field/{field-id}/search/{search-field-id} | GET /api/public/dashboard/{uuid}/field/{field-id}/search/{search-field-id}
[**apiPublicDashboardUuidFieldFieldIdValuesGet**](ApiPublicApi.md#apiPublicDashboardUuidFieldFieldIdValuesGet) | **GET** /api/public/dashboard/{uuid}/field/{field-id}/values | GET /api/public/dashboard/{uuid}/field/{field-id}/values
[**apiPublicDashboardUuidGet**](ApiPublicApi.md#apiPublicDashboardUuidGet) | **GET** /api/public/dashboard/{uuid} | GET /api/public/dashboard/{uuid}
[**apiPublicDashboardUuidParamsParamKeySearchQueryGet**](ApiPublicApi.md#apiPublicDashboardUuidParamsParamKeySearchQueryGet) | **GET** /api/public/dashboard/{uuid}/params/{param-key}/search/{query} | GET /api/public/dashboard/{uuid}/params/{param-key}/search/{query}
[**apiPublicDashboardUuidParamsParamKeyValuesGet**](ApiPublicApi.md#apiPublicDashboardUuidParamsParamKeyValuesGet) | **GET** /api/public/dashboard/{uuid}/params/{param-key}/values | GET /api/public/dashboard/{uuid}/params/{param-key}/values
[**apiPublicOembedGet**](ApiPublicApi.md#apiPublicOembedGet) | **GET** /api/public/oembed | GET /api/public/oembed
[**apiPublicPivotCardUuidQueryGet**](ApiPublicApi.md#apiPublicPivotCardUuidQueryGet) | **GET** /api/public/pivot/card/{uuid}/query | GET /api/public/pivot/card/{uuid}/query
[**apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet**](ApiPublicApi.md#apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet) | **GET** /api/public/pivot/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id} | GET /api/public/pivot/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}



## apiPublicActionUuidExecutePost

> apiPublicActionUuidExecutePost(uuid, opts)

POST /api/public/action/{uuid}/execute

Execute the Action.     &#x60;parameters&#x60; should be the mapped dashboard parameters with values.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let opts = {
  'apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest': new MetabaseApi.ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest() // ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest | 
};
apiInstance.apiPublicActionUuidExecutePost(uuid, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest** | [**ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest**](ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPublicActionUuidGet

> apiPublicActionUuidGet(uuid)

GET /api/public/action/{uuid}

Fetch a publicly-accessible Action. Does not require auth credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
apiInstance.apiPublicActionUuidGet(uuid, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet

> apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet(uuid, fieldId, remappedId, value)

GET /api/public/card/{uuid}/field/{field-id}/remapping/{remapped-id}

Fetch remapped Field values. This is the same as &#x60;GET /api/field/:id/remapping/:remapped-id&#x60;, but for use with public   Cards.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
let remappedId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiPublicCardUuidFieldFieldIdRemappingRemappedIdGet(uuid, fieldId, remappedId, value, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 
 **remappedId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet

> apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet(uuid, fieldId, searchFieldId, value, opts)

GET /api/public/card/{uuid}/field/{field-id}/search/{search-field-id}

Search for values of a Field that is referenced by a public Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
let searchFieldId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
let opts = {
  'limit': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiPublicCardUuidFieldFieldIdSearchSearchFieldIdGet(uuid, fieldId, searchFieldId, value, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 
 **searchFieldId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 
 **limit** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidFieldFieldIdValuesGet

> apiPublicCardUuidFieldFieldIdValuesGet(uuid, fieldId)

GET /api/public/card/{uuid}/field/{field-id}/values

Fetch FieldValues for a Field that is referenced by a public Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPublicCardUuidFieldFieldIdValuesGet(uuid, fieldId, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidGet

> apiPublicCardUuidGet(uuid)

GET /api/public/card/{uuid}

Fetch a publicly-accessible Card an return query results as well as &#x60;:card&#x60; information. Does not require auth    credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
apiInstance.apiPublicCardUuidGet(uuid, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidParamsParamKeySearchQueryGet

> apiPublicCardUuidParamsParamKeySearchQueryGet(uuid, paramKey, query)

GET /api/public/card/{uuid}/params/{param-key}/search/{query}

Fetch values for a parameter on a public card containing &#x60;query&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
let query = "query_example"; // String | value must be a non-blank string.
apiInstance.apiPublicCardUuidParamsParamKeySearchQueryGet(uuid, paramKey, query, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **paramKey** | **String**| value must be a non-blank string. | 
 **query** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidParamsParamKeyValuesGet

> apiPublicCardUuidParamsParamKeyValuesGet(uuid, paramKey)

GET /api/public/card/{uuid}/params/{param-key}/values

Fetch values for a parameter on a public card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
apiInstance.apiPublicCardUuidParamsParamKeyValuesGet(uuid, paramKey, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **paramKey** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidQueryExportFormatGet

> apiPublicCardUuidQueryExportFormatGet(uuid, exportFormat, formatRows, pivotResults, opts)

GET /api/public/card/{uuid}/query/{export-format}

Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth   credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let exportFormat = "exportFormat_example"; // String | 
let formatRows = false; // Boolean | 
let pivotResults = false; // Boolean | 
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiPublicCardUuidQueryExportFormatGet(uuid, exportFormat, formatRows, pivotResults, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **exportFormat** | **String**|  | 
 **formatRows** | **Boolean**|  | [default to false]
 **pivotResults** | **Boolean**|  | [default to false]
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicCardUuidQueryGet

> apiPublicCardUuidQueryGet(uuid, opts)

GET /api/public/card/{uuid}/query

Fetch a publicly-accessible Card an return query results as well as &#x60;:card&#x60; information. Does not require auth    credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiPublicCardUuidQueryGet(uuid, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost

> apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost(uuid, dashcardId, cardId, exportFormat, opts)

POST /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}/{export-format}

Fetch the results of running a publicly-accessible Card belonging to a Dashboard and return the data in one of the   export formats. Does not require auth credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let exportFormat = "exportFormat_example"; // String | 
let opts = {
  'apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest': new MetabaseApi.ApiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest() // ApiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest | 
};
apiInstance.apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPost(uuid, dashcardId, cardId, exportFormat, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **exportFormat** | **String**|  | 
 **apiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest** | [**ApiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest**](ApiPublicDashboardUuidDashcardDashcardIdCardCardIdExportFormatPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet

> apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet(uuid, dashcardId, cardId, opts)

GET /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public    sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiPublicDashboardUuidDashcardDashcardIdCardCardIdGet(uuid, dashcardId, cardId, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidDashcardDashcardIdExecuteGet

> apiPublicDashboardUuidDashcardDashcardIdExecuteGet(uuid, dashcardId, parameters)

GET /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let parameters = "parameters_example"; // String | value must be a valid JSON string.
apiInstance.apiPublicDashboardUuidDashcardDashcardIdExecuteGet(uuid, dashcardId, parameters, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **parameters** | **String**| value must be a valid JSON string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidDashcardDashcardIdExecutePost

> apiPublicDashboardUuidDashcardDashcardIdExecutePost(uuid, dashcardId, opts)

POST /api/public/dashboard/{uuid}/dashcard/{dashcard-id}/execute

Execute the associated Action in the context of a &#x60;Dashboard&#x60; and &#x60;DashboardCard&#x60; that includes it.     &#x60;parameters&#x60; should be the mapped dashboard parameters with values.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest': new MetabaseApi.ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest() // ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest | 
};
apiInstance.apiPublicDashboardUuidDashcardDashcardIdExecutePost(uuid, dashcardId, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **apiDashboardDashboardIdDashcardDashcardIdExecutePostRequest** | [**ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest**](ApiDashboardDashboardIdDashcardDashcardIdExecutePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet

> apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet(uuid, fieldId, remappedId, value)

GET /api/public/dashboard/{uuid}/field/{field-id}/remapping/{remapped-id}

Fetch remapped Field values. This is the same as &#x60;GET /api/field/:id/remapping/:remapped-id&#x60;, but for use with public   Dashboards.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
let remappedId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiPublicDashboardUuidFieldFieldIdRemappingRemappedIdGet(uuid, fieldId, remappedId, value, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 
 **remappedId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet

> apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet(uuid, fieldId, searchFieldId, value, opts)

GET /api/public/dashboard/{uuid}/field/{field-id}/search/{search-field-id}

Search for values of a Field that is referenced by a Card in a public Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
let searchFieldId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
let opts = {
  'limit': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiPublicDashboardUuidFieldFieldIdSearchSearchFieldIdGet(uuid, fieldId, searchFieldId, value, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 
 **searchFieldId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 
 **limit** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidFieldFieldIdValuesGet

> apiPublicDashboardUuidFieldFieldIdValuesGet(uuid, fieldId)

GET /api/public/dashboard/{uuid}/field/{field-id}/values

Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let fieldId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPublicDashboardUuidFieldFieldIdValuesGet(uuid, fieldId, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidGet

> apiPublicDashboardUuidGet(uuid)

GET /api/public/dashboard/{uuid}

Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
apiInstance.apiPublicDashboardUuidGet(uuid, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidParamsParamKeySearchQueryGet

> apiPublicDashboardUuidParamsParamKeySearchQueryGet(uuid, paramKey, query)

GET /api/public/dashboard/{uuid}/params/{param-key}/search/{query}

Fetch filter values for dashboard parameter &#x60;param-key&#x60;, containing specified &#x60;query&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
let query = "query_example"; // String | value must be a non-blank string.
apiInstance.apiPublicDashboardUuidParamsParamKeySearchQueryGet(uuid, paramKey, query, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **paramKey** | **String**| value must be a non-blank string. | 
 **query** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicDashboardUuidParamsParamKeyValuesGet

> apiPublicDashboardUuidParamsParamKeyValuesGet(uuid, paramKey)

GET /api/public/dashboard/{uuid}/params/{param-key}/values

Fetch filter values for dashboard parameter &#x60;param-key&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let paramKey = "paramKey_example"; // String | value must be a non-blank string.
apiInstance.apiPublicDashboardUuidParamsParamKeyValuesGet(uuid, paramKey, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **paramKey** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicOembedGet

> apiPublicOembedGet(url, maxheight, maxwidth, opts)

GET /api/public/oembed

oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let url = "url_example"; // String | value must be a non-blank string.
let maxheight = 800; // Number | 
let maxwidth = 1024; // Number | 
let opts = {
  'format': "format_example" // String | The format param is not used by the API, but is required as part of the oEmbed spec: http://oembed.com/#section2 just return an error if `format` is specified and it's anything other than `json`.
};
apiInstance.apiPublicOembedGet(url, maxheight, maxwidth, opts, (error, data, response) => {
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
 **url** | **String**| value must be a non-blank string. | 
 **maxheight** | **Number**|  | [default to 800]
 **maxwidth** | **Number**|  | [default to 1024]
 **format** | **String**| The format param is not used by the API, but is required as part of the oEmbed spec: http://oembed.com/#section2 just return an error if &#x60;format&#x60; is specified and it&#39;s anything other than &#x60;json&#x60;. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicPivotCardUuidQueryGet

> apiPublicPivotCardUuidQueryGet(uuid, opts)

GET /api/public/pivot/card/{uuid}/query

Fetch a publicly-accessible Card an return query results as well as &#x60;:card&#x60; information. Does not require auth    credentials. Public sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiPublicPivotCardUuidQueryGet(uuid, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet

> apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet(uuid, cardId, dashcardId, opts)

GET /api/public/pivot/dashboard/{uuid}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public   sharing must be enabled.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPublicApi();
let uuid = "uuid_example"; // String | value must be a valid UUID.
let cardId = 56; // Number | value must be an integer greater than zero.
let dashcardId = 56; // Number | value must be an integer greater than zero.
let opts = {
  'parameters': "parameters_example" // String | value must be a valid JSON string.
};
apiInstance.apiPublicPivotDashboardUuidDashcardDashcardIdCardCardIdGet(uuid, cardId, dashcardId, opts, (error, data, response) => {
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
 **uuid** | **String**| value must be a valid UUID. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **parameters** | **String**| value must be a valid JSON string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

