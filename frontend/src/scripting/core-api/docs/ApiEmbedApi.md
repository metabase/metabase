# MetabaseApi.ApiEmbedApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiEmbedCardTokenFieldFieldIdRemappingRemappedIdGet**](ApiEmbedApi.md#apiEmbedCardTokenFieldFieldIdRemappingRemappedIdGet) | **GET** /api/embed/card/{token}/field/{field-id}/remapping/{remapped-id} | GET /api/embed/card/{token}/field/{field-id}/remapping/{remapped-id}
[**apiEmbedCardTokenFieldFieldIdSearchSearchFieldIdGet**](ApiEmbedApi.md#apiEmbedCardTokenFieldFieldIdSearchSearchFieldIdGet) | **GET** /api/embed/card/{token}/field/{field-id}/search/{search-field-id} | GET /api/embed/card/{token}/field/{field-id}/search/{search-field-id}
[**apiEmbedCardTokenFieldFieldIdValuesGet**](ApiEmbedApi.md#apiEmbedCardTokenFieldFieldIdValuesGet) | **GET** /api/embed/card/{token}/field/{field-id}/values | GET /api/embed/card/{token}/field/{field-id}/values
[**apiEmbedCardTokenGet**](ApiEmbedApi.md#apiEmbedCardTokenGet) | **GET** /api/embed/card/{token} | GET /api/embed/card/{token}
[**apiEmbedCardTokenParamsParamKeySearchPrefixGet**](ApiEmbedApi.md#apiEmbedCardTokenParamsParamKeySearchPrefixGet) | **GET** /api/embed/card/{token}/params/{param-key}/search/{prefix} | GET /api/embed/card/{token}/params/{param-key}/search/{prefix}
[**apiEmbedCardTokenParamsParamKeyValuesGet**](ApiEmbedApi.md#apiEmbedCardTokenParamsParamKeyValuesGet) | **GET** /api/embed/card/{token}/params/{param-key}/values | GET /api/embed/card/{token}/params/{param-key}/values
[**apiEmbedCardTokenQueryExportFormatGet**](ApiEmbedApi.md#apiEmbedCardTokenQueryExportFormatGet) | **GET** /api/embed/card/{token}/query/{export-format} | GET /api/embed/card/{token}/query/{export-format}
[**apiEmbedCardTokenQueryGet**](ApiEmbedApi.md#apiEmbedCardTokenQueryGet) | **GET** /api/embed/card/{token}/query | GET /api/embed/card/{token}/query
[**apiEmbedDashboardTokenDashcardDashcardIdCardCardIdExportFormatGet**](ApiEmbedApi.md#apiEmbedDashboardTokenDashcardDashcardIdCardCardIdExportFormatGet) | **GET** /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}/{export-format} | GET /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}/{export-format}
[**apiEmbedDashboardTokenDashcardDashcardIdCardCardIdGet**](ApiEmbedApi.md#apiEmbedDashboardTokenDashcardDashcardIdCardCardIdGet) | **GET** /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id} | GET /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}
[**apiEmbedDashboardTokenFieldFieldIdRemappingRemappedIdGet**](ApiEmbedApi.md#apiEmbedDashboardTokenFieldFieldIdRemappingRemappedIdGet) | **GET** /api/embed/dashboard/{token}/field/{field-id}/remapping/{remapped-id} | GET /api/embed/dashboard/{token}/field/{field-id}/remapping/{remapped-id}
[**apiEmbedDashboardTokenFieldFieldIdSearchSearchFieldIdGet**](ApiEmbedApi.md#apiEmbedDashboardTokenFieldFieldIdSearchSearchFieldIdGet) | **GET** /api/embed/dashboard/{token}/field/{field-id}/search/{search-field-id} | GET /api/embed/dashboard/{token}/field/{field-id}/search/{search-field-id}
[**apiEmbedDashboardTokenFieldFieldIdValuesGet**](ApiEmbedApi.md#apiEmbedDashboardTokenFieldFieldIdValuesGet) | **GET** /api/embed/dashboard/{token}/field/{field-id}/values | GET /api/embed/dashboard/{token}/field/{field-id}/values
[**apiEmbedDashboardTokenGet**](ApiEmbedApi.md#apiEmbedDashboardTokenGet) | **GET** /api/embed/dashboard/{token} | GET /api/embed/dashboard/{token}
[**apiEmbedDashboardTokenParamsParamKeySearchPrefixGet**](ApiEmbedApi.md#apiEmbedDashboardTokenParamsParamKeySearchPrefixGet) | **GET** /api/embed/dashboard/{token}/params/{param-key}/search/{prefix} | GET /api/embed/dashboard/{token}/params/{param-key}/search/{prefix}
[**apiEmbedDashboardTokenParamsParamKeyValuesGet**](ApiEmbedApi.md#apiEmbedDashboardTokenParamsParamKeyValuesGet) | **GET** /api/embed/dashboard/{token}/params/{param-key}/values | GET /api/embed/dashboard/{token}/params/{param-key}/values
[**apiEmbedPivotCardTokenQueryGet**](ApiEmbedApi.md#apiEmbedPivotCardTokenQueryGet) | **GET** /api/embed/pivot/card/{token}/query | GET /api/embed/pivot/card/{token}/query
[**apiEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet**](ApiEmbedApi.md#apiEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet) | **GET** /api/embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id} | GET /api/embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}



## apiEmbedCardTokenFieldFieldIdRemappingRemappedIdGet

> apiEmbedCardTokenFieldFieldIdRemappingRemappedIdGet(token, fieldId, remappedId, value)

GET /api/embed/card/{token}/field/{field-id}/remapping/{remapped-id}

Fetch remapped Field values. This is the same as &#x60;GET /api/field/:id/remapping/:remapped-id&#x60;, but for use with   embedded Cards.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
let remappedId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiEmbedCardTokenFieldFieldIdRemappingRemappedIdGet(token, fieldId, remappedId, value, (error, data, response) => {
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
 **token** | **String**|  | 
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


## apiEmbedCardTokenFieldFieldIdSearchSearchFieldIdGet

> apiEmbedCardTokenFieldFieldIdSearchSearchFieldIdGet(token, fieldId, searchFieldId, value, opts)

GET /api/embed/card/{token}/field/{field-id}/search/{search-field-id}

Search for values of a Field that is referenced by an embedded Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
let searchFieldId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
let opts = {
  'limit': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiEmbedCardTokenFieldFieldIdSearchSearchFieldIdGet(token, fieldId, searchFieldId, value, opts, (error, data, response) => {
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
 **token** | **String**|  | 
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


## apiEmbedCardTokenFieldFieldIdValuesGet

> apiEmbedCardTokenFieldFieldIdValuesGet(token, fieldId)

GET /api/embed/card/{token}/field/{field-id}/values

Fetch FieldValues for a Field that is referenced by an embedded Card.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEmbedCardTokenFieldFieldIdValuesGet(token, fieldId, (error, data, response) => {
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
 **token** | **String**|  | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedCardTokenGet

> apiEmbedCardTokenGet(token)

GET /api/embed/card/{token}

Fetch a Card via a JSON Web Token signed with the &#x60;embedding-secret-key&#x60;.     Token should have the following format:       {:resource {:question &lt;card-id&gt;}}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
apiInstance.apiEmbedCardTokenGet(token, (error, data, response) => {
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
 **token** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedCardTokenParamsParamKeySearchPrefixGet

> apiEmbedCardTokenParamsParamKeySearchPrefixGet()

GET /api/embed/card/{token}/params/{param-key}/search/{prefix}

Embedded version of chain filter search endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
apiInstance.apiEmbedCardTokenParamsParamKeySearchPrefixGet((error, data, response) => {
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


## apiEmbedCardTokenParamsParamKeyValuesGet

> apiEmbedCardTokenParamsParamKeyValuesGet(token, paramKey)

GET /api/embed/card/{token}/params/{param-key}/values

Embedded version of api.card filter values endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let paramKey = "paramKey_example"; // String | 
apiInstance.apiEmbedCardTokenParamsParamKeyValuesGet(token, paramKey, (error, data, response) => {
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
 **token** | **String**|  | 
 **paramKey** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedCardTokenQueryExportFormatGet

> apiEmbedCardTokenQueryExportFormatGet(token, exportFormat, formatRows, pivotResults)

GET /api/embed/card/{token}/query/{export-format}

Like &#x60;GET /api/embed/card/query&#x60;, but returns the results as a file in the specified format.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let exportFormat = "exportFormat_example"; // String | 
let formatRows = false; // Boolean | 
let pivotResults = false; // Boolean | 
apiInstance.apiEmbedCardTokenQueryExportFormatGet(token, exportFormat, formatRows, pivotResults, (error, data, response) => {
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
 **token** | **String**|  | 
 **exportFormat** | **String**|  | 
 **formatRows** | **Boolean**|  | [default to false]
 **pivotResults** | **Boolean**|  | [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedCardTokenQueryGet

> apiEmbedCardTokenQueryGet(token)

GET /api/embed/card/{token}/query

Fetch the results of running a Card using a JSON Web Token signed with the &#x60;embedding-secret-key&#x60;.     Token should have the following format:       {:resource {:question &lt;card-id&gt;}       :params   &lt;parameters&gt;}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
apiInstance.apiEmbedCardTokenQueryGet(token, (error, data, response) => {
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
 **token** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedDashboardTokenDashcardDashcardIdCardCardIdExportFormatGet

> apiEmbedDashboardTokenDashcardDashcardIdCardCardIdExportFormatGet(dashcardId, cardId, exportFormat, formatRows, pivotResults)

GET /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}/{export-format}

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the   &#x60;embedding-secret-key&#x60; return the data in one of the export formats

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
let exportFormat = "exportFormat_example"; // String | 
let formatRows = false; // Boolean | 
let pivotResults = false; // Boolean | 
apiInstance.apiEmbedDashboardTokenDashcardDashcardIdCardCardIdExportFormatGet(dashcardId, cardId, exportFormat, formatRows, pivotResults, (error, data, response) => {
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
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 
 **exportFormat** | **String**|  | 
 **formatRows** | **Boolean**|  | [default to false]
 **pivotResults** | **Boolean**|  | [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedDashboardTokenDashcardDashcardIdCardCardIdGet

> apiEmbedDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId)

GET /api/embed/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the   &#x60;embedding-secret-key&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEmbedDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId, (error, data, response) => {
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
 **token** | **String**|  | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedDashboardTokenFieldFieldIdRemappingRemappedIdGet

> apiEmbedDashboardTokenFieldFieldIdRemappingRemappedIdGet(token, fieldId, remappedId, value)

GET /api/embed/dashboard/{token}/field/{field-id}/remapping/{remapped-id}

Fetch remapped Field values. This is the same as &#x60;GET /api/field/:id/remapping/:remapped-id&#x60;, but for use with   embedded Dashboards.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
let remappedId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiEmbedDashboardTokenFieldFieldIdRemappingRemappedIdGet(token, fieldId, remappedId, value, (error, data, response) => {
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
 **token** | **String**|  | 
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


## apiEmbedDashboardTokenFieldFieldIdSearchSearchFieldIdGet

> apiEmbedDashboardTokenFieldFieldIdSearchSearchFieldIdGet(token, fieldId, searchFieldId, value, opts)

GET /api/embed/dashboard/{token}/field/{field-id}/search/{search-field-id}

Search for values of a Field that is referenced by a Card in an embedded Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
let searchFieldId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
let opts = {
  'limit': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiEmbedDashboardTokenFieldFieldIdSearchSearchFieldIdGet(token, fieldId, searchFieldId, value, opts, (error, data, response) => {
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
 **token** | **String**|  | 
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


## apiEmbedDashboardTokenFieldFieldIdValuesGet

> apiEmbedDashboardTokenFieldFieldIdValuesGet(token, fieldId)

GET /api/embed/dashboard/{token}/field/{field-id}/values

Fetch FieldValues for a Field that is used as a param in an embedded Dashboard.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let fieldId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEmbedDashboardTokenFieldFieldIdValuesGet(token, fieldId, (error, data, response) => {
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
 **token** | **String**|  | 
 **fieldId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedDashboardTokenGet

> apiEmbedDashboardTokenGet(token)

GET /api/embed/dashboard/{token}

Fetch a Dashboard via a JSON Web Token signed with the &#x60;embedding-secret-key&#x60;.     Token should have the following format:       {:resource {:dashboard &lt;dashboard-id&gt;}}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
apiInstance.apiEmbedDashboardTokenGet(token, (error, data, response) => {
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
 **token** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedDashboardTokenParamsParamKeySearchPrefixGet

> apiEmbedDashboardTokenParamsParamKeySearchPrefixGet()

GET /api/embed/dashboard/{token}/params/{param-key}/search/{prefix}

Embedded version of chain filter search endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
apiInstance.apiEmbedDashboardTokenParamsParamKeySearchPrefixGet((error, data, response) => {
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


## apiEmbedDashboardTokenParamsParamKeyValuesGet

> apiEmbedDashboardTokenParamsParamKeyValuesGet(token, paramKey)

GET /api/embed/dashboard/{token}/params/{param-key}/values

Embedded version of chain filter values endpoint.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let paramKey = "paramKey_example"; // String | 
apiInstance.apiEmbedDashboardTokenParamsParamKeyValuesGet(token, paramKey, (error, data, response) => {
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
 **token** | **String**|  | 
 **paramKey** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedPivotCardTokenQueryGet

> apiEmbedPivotCardTokenQueryGet(token)

GET /api/embed/pivot/card/{token}/query

Fetch the results of running a Card using a JSON Web Token signed with the &#x60;embedding-secret-key&#x60;.     Token should have the following format:       {:resource {:question &lt;card-id&gt;}       :params   &lt;parameters&gt;}

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
apiInstance.apiEmbedPivotCardTokenQueryGet(token, (error, data, response) => {
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
 **token** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet

> apiEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId)

GET /api/embed/pivot/dashboard/{token}/dashcard/{dashcard-id}/card/{card-id}

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the   &#x60;embedding-secret-key&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiEmbedApi();
let token = "token_example"; // String | 
let dashcardId = 56; // Number | value must be an integer greater than zero.
let cardId = 56; // Number | value must be an integer greater than zero.
apiInstance.apiEmbedPivotDashboardTokenDashcardDashcardIdCardCardIdGet(token, dashcardId, cardId, (error, data, response) => {
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
 **token** | **String**|  | 
 **dashcardId** | **Number**| value must be an integer greater than zero. | 
 **cardId** | **Number**| value must be an integer greater than zero. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

