# MetabaseApi.ApiFieldApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiFieldIdDimensionDelete**](ApiFieldApi.md#apiFieldIdDimensionDelete) | **DELETE** /api/field/{id}/dimension | DELETE /api/field/{id}/dimension
[**apiFieldIdDimensionPost**](ApiFieldApi.md#apiFieldIdDimensionPost) | **POST** /api/field/{id}/dimension | POST /api/field/{id}/dimension
[**apiFieldIdDiscardValuesPost**](ApiFieldApi.md#apiFieldIdDiscardValuesPost) | **POST** /api/field/{id}/discard_values | POST /api/field/{id}/discard_values
[**apiFieldIdGet**](ApiFieldApi.md#apiFieldIdGet) | **GET** /api/field/{id} | GET /api/field/{id}
[**apiFieldIdPut**](ApiFieldApi.md#apiFieldIdPut) | **PUT** /api/field/{id} | PUT /api/field/{id}
[**apiFieldIdRelatedGet**](ApiFieldApi.md#apiFieldIdRelatedGet) | **GET** /api/field/{id}/related | GET /api/field/{id}/related
[**apiFieldIdRemappingRemappedIdGet**](ApiFieldApi.md#apiFieldIdRemappingRemappedIdGet) | **GET** /api/field/{id}/remapping/{remapped-id} | GET /api/field/{id}/remapping/{remapped-id}
[**apiFieldIdRescanValuesPost**](ApiFieldApi.md#apiFieldIdRescanValuesPost) | **POST** /api/field/{id}/rescan_values | POST /api/field/{id}/rescan_values
[**apiFieldIdSearchSearchIdGet**](ApiFieldApi.md#apiFieldIdSearchSearchIdGet) | **GET** /api/field/{id}/search/{search-id} | GET /api/field/{id}/search/{search-id}
[**apiFieldIdSummaryGet**](ApiFieldApi.md#apiFieldIdSummaryGet) | **GET** /api/field/{id}/summary | GET /api/field/{id}/summary
[**apiFieldIdValuesGet**](ApiFieldApi.md#apiFieldIdValuesGet) | **GET** /api/field/{id}/values | GET /api/field/{id}/values
[**apiFieldIdValuesPost**](ApiFieldApi.md#apiFieldIdValuesPost) | **POST** /api/field/{id}/values | POST /api/field/{id}/values



## apiFieldIdDimensionDelete

> apiFieldIdDimensionDelete(id)

DELETE /api/field/{id}/dimension

Remove the dimension associated to field at ID

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdDimensionDelete(id, (error, data, response) => {
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


## apiFieldIdDimensionPost

> apiFieldIdDimensionPost(id, opts)

POST /api/field/{id}/dimension

Sets the dimension for the given field at ID

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiFieldIdDimensionPostRequest': new MetabaseApi.ApiFieldIdDimensionPostRequest() // ApiFieldIdDimensionPostRequest | 
};
apiInstance.apiFieldIdDimensionPost(id, opts, (error, data, response) => {
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
 **apiFieldIdDimensionPostRequest** | [**ApiFieldIdDimensionPostRequest**](ApiFieldIdDimensionPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiFieldIdDiscardValuesPost

> apiFieldIdDiscardValuesPost(id)

POST /api/field/{id}/discard_values

Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field&#39;s    Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdDiscardValuesPost(id, (error, data, response) => {
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


## apiFieldIdGet

> apiFieldIdGet(id, includeEditableDataModel)

GET /api/field/{id}

Get &#x60;Field&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let includeEditableDataModel = false; // Boolean | 
apiInstance.apiFieldIdGet(id, includeEditableDataModel, (error, data, response) => {
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
 **includeEditableDataModel** | **Boolean**|  | [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiFieldIdPut

> apiFieldIdPut(id, opts)

PUT /api/field/{id}

Update &#x60;Field&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiFieldIdPutRequest': new MetabaseApi.ApiFieldIdPutRequest() // ApiFieldIdPutRequest | 
};
apiInstance.apiFieldIdPut(id, opts, (error, data, response) => {
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
 **apiFieldIdPutRequest** | [**ApiFieldIdPutRequest**](ApiFieldIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiFieldIdRelatedGet

> apiFieldIdRelatedGet(id)

GET /api/field/{id}/related

Return related entities.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdRelatedGet(id, (error, data, response) => {
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


## apiFieldIdRemappingRemappedIdGet

> apiFieldIdRemappingRemappedIdGet(id, remappedId, value)

GET /api/field/{id}/remapping/{remapped-id}

Fetch remapped Field values.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let remappedId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiFieldIdRemappingRemappedIdGet(id, remappedId, value, (error, data, response) => {
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
 **remappedId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiFieldIdRescanValuesPost

> apiFieldIdRescanValuesPost(id)

POST /api/field/{id}/rescan_values

Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for    FieldValues.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdRescanValuesPost(id, (error, data, response) => {
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


## apiFieldIdSearchSearchIdGet

> apiFieldIdSearchSearchIdGet(id, searchId, value)

GET /api/field/{id}/search/{search-id}

Search for values of a Field with &#x60;search-id&#x60; that start with &#x60;value&#x60;. See docstring for   &#x60;metabase.api.field/search-values&#x60; for a more detailed explanation.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let searchId = 56; // Number | value must be an integer greater than zero.
let value = "value_example"; // String | value must be a non-blank string.
apiInstance.apiFieldIdSearchSearchIdGet(id, searchId, value, (error, data, response) => {
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
 **searchId** | **Number**| value must be an integer greater than zero. | 
 **value** | **String**| value must be a non-blank string. | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiFieldIdSummaryGet

> apiFieldIdSummaryGet(id)

GET /api/field/{id}/summary

Get the count and distinct count of &#x60;Field&#x60; with ID.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdSummaryGet(id, (error, data, response) => {
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


## apiFieldIdValuesGet

> apiFieldIdValuesGet(id)

GET /api/field/{id}/values

If a Field&#39;s value of &#x60;has_field_values&#x60; is &#x60;:list&#x60;, return a list of all the distinct values of the Field (or   remapped Field), and (if defined by a User) a map of human-readable remapped values. If &#x60;has_field_values&#x60; is not   &#x60;:list&#x60;, checks whether we should create FieldValues for this Field; if so, creates and returns them.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiFieldIdValuesGet(id, (error, data, response) => {
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


## apiFieldIdValuesPost

> apiFieldIdValuesPost(id, opts)

POST /api/field/{id}/values

Update the fields values and human-readable values for a &#x60;Field&#x60; whose semantic type is   &#x60;category&#x60;/&#x60;city&#x60;/&#x60;state&#x60;/&#x60;country&#x60; or whose base type is &#x60;type/Boolean&#x60;. The human-readable values are optional.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiFieldApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiFieldIdValuesPostRequest': new MetabaseApi.ApiFieldIdValuesPostRequest() // ApiFieldIdValuesPostRequest | 
};
apiInstance.apiFieldIdValuesPost(id, opts, (error, data, response) => {
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
 **apiFieldIdValuesPostRequest** | [**ApiFieldIdValuesPostRequest**](ApiFieldIdValuesPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

