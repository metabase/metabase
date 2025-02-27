# MetabaseApi.ApiAutomagicDashboardsApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiAutomagicDashboardsDatabaseIdCandidatesGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsDatabaseIdCandidatesGet) | **GET** /api/automagic-dashboards/database/{id}/candidates | GET /api/automagic-dashboards/database/{id}/candidates
[**apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryCompareComparisonEntityComparisonEntityIdOrQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryCompareComparisonEntityComparisonEntityIdOrQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/compare/{comparison-entity}/{comparison-entity-id-or-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/compare/{comparison-entity}/{comparison-entity-id-or-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template}
[**apiAutomagicDashboardsEntityEntityIdOrQueryCompareComparisonEntityComparisonEntityIdOrQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryCompareComparisonEntityComparisonEntityIdOrQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/compare/{comparison-entity}/{comparison-entity-id-or-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/compare/{comparison-entity}/{comparison-entity-id-or-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryQueryMetadataGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryQueryMetadataGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/query_metadata | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/query_metadata
[**apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query}
[**apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateGet) | **GET** /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template} | GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template}
[**apiAutomagicDashboardsModelIndexModelIndexIdPrimaryKeyPkIdGet**](ApiAutomagicDashboardsApi.md#apiAutomagicDashboardsModelIndexModelIndexIdPrimaryKeyPkIdGet) | **GET** /api/automagic-dashboards/model_index/{model-index-id}/primary_key/{pk-id} | GET /api/automagic-dashboards/model_index/{model-index-id}/primary_key/{pk-id}



## apiAutomagicDashboardsDatabaseIdCandidatesGet

> apiAutomagicDashboardsDatabaseIdCandidatesGet(id)

GET /api/automagic-dashboards/database/{id}/candidates

Return a list of candidates for automagic dashboards ordered by interestingness.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiAutomagicDashboardsDatabaseIdCandidatesGet(id, (error, data, response) => {
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


## apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryCompareComparisonEntityComparisonEntityIdOrQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, cellQuery, comparisonEntity, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/compare/{comparison-entity}/{comparison-entity-id-or-query}

Return an automagic comparison dashboard for cell in automagic dashboard for entity &#x60;entity&#x60;    with id &#x60;id&#x60; defined by query &#x60;cell-query&#x60;; compared with entity &#x60;comparison-entity&#x60; with id    &#x60;comparison-entity-id-or-query.&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let cellQuery = null; // Object | form-encoded base-64-encoded JSON
let comparisonEntity = "comparisonEntity_example"; // String | Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, cellQuery, comparisonEntity, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **cellQuery** | [**Object**](.md)| form-encoded base-64-encoded JSON | 
 **comparisonEntity** | **String**| Invalid comparison entity type. Can only be one of \&quot;table\&quot;, \&quot;segment\&quot;, or \&quot;adhoc\&quot; | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGet(entity, entityIdOrQuery, cellQuery, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}

Return an automagic dashboard analyzing cell in automagic dashboard for entity &#x60;entity&#x60; defined by query   &#x60;cell-query&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let cellQuery = null; // Object | form-encoded base-64-encoded JSON
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGet(entity, entityIdOrQuery, cellQuery, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **cellQuery** | [**Object**](.md)| form-encoded base-64-encoded JSON | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, prefix, dashboardTemplate, cellQuery, comparisonEntity, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query}

Return an automagic comparison dashboard for cell in automagic dashboard for entity &#x60;entity&#x60;    with id &#x60;id&#x60; defined by query &#x60;cell-query&#x60; using dashboard-template &#x60;dashboard-template&#x60;; compared with entity    &#x60;comparison-entity&#x60; with id &#x60;comparison-entity-id-or-query.&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let prefix = null; // Object | 
let dashboardTemplate = null; // Object | invalid value for dashboard template name
let cellQuery = null; // Object | form-encoded base-64-encoded JSON
let comparisonEntity = "comparisonEntity_example"; // String | Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, prefix, dashboardTemplate, cellQuery, comparisonEntity, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **prefix** | [**Object**](.md)|  | 
 **dashboardTemplate** | [**Object**](.md)| invalid value for dashboard template name | 
 **cellQuery** | [**Object**](.md)| form-encoded base-64-encoded JSON | 
 **comparisonEntity** | **String**| Invalid comparison entity type. Can only be one of \&quot;table\&quot;, \&quot;segment\&quot;, or \&quot;adhoc\&quot; | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateGet

> apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateGet(entity, entityIdOrQuery, prefix, dashboardTemplate, cellQuery, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/cell/{cell-query}/rule/{prefix}/{dashboard-template}

Return an automagic dashboard analyzing cell in question with id &#x60;id&#x60; defined by query &#x60;cell-query&#x60; using   dashboard-template &#x60;dashboard-template&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let prefix = null; // Object | 
let dashboardTemplate = null; // Object | invalid value for dashboard template name
let cellQuery = null; // Object | form-encoded base-64-encoded JSON
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryRulePrefixDashboardTemplateGet(entity, entityIdOrQuery, prefix, dashboardTemplate, cellQuery, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **prefix** | [**Object**](.md)|  | 
 **dashboardTemplate** | [**Object**](.md)| invalid value for dashboard template name | 
 **cellQuery** | [**Object**](.md)| form-encoded base-64-encoded JSON | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryCompareComparisonEntityComparisonEntityIdOrQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryCompareComparisonEntityComparisonEntityIdOrQueryGet(entityIdOrQuery, entity, comparisonEntity, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/compare/{comparison-entity}/{comparison-entity-id-or-query}

Return an automagic comparison dashboard for entity &#x60;entity&#x60; with id &#x60;id&#x60; compared with entity &#x60;comparison-entity&#x60;   with id &#x60;comparison-entity-id-or-query.&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let entity = "entity_example"; // String | 
let comparisonEntity = "comparisonEntity_example"; // String | Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryCompareComparisonEntityComparisonEntityIdOrQueryGet(entityIdOrQuery, entity, comparisonEntity, opts, (error, data, response) => {
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
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **entity** | **String**|  | 
 **comparisonEntity** | **String**| Invalid comparison entity type. Can only be one of \&quot;table\&quot;, \&quot;segment\&quot;, or \&quot;adhoc\&quot; | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryGet(entity, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}

Return an automagic dashboard for entity &#x60;entity&#x60; with id &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let opts = {
  'show': 56 // Number | 
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryGet(entity, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **show** | **Number**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryQueryMetadataGet

> apiAutomagicDashboardsEntityEntityIdOrQueryQueryMetadataGet(entity)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/query_metadata

Return all metadata for an automagic dashboard for entity &#x60;entity&#x60; with id &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryQueryMetadataGet(entity, (error, data, response) => {
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
 **entity** | **String**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet

> apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, prefix, dashboardTemplate, comparisonEntity, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template}/compare/{comparison-entity}/{comparison-entity-id-or-query}

Return an automagic comparison dashboard for entity &#x60;entity&#x60; with id &#x60;id&#x60; using dashboard-template   &#x60;dashboard-template&#x60;; compared with entity &#x60;comparison-entity&#x60; with id &#x60;comparison-entity-id-or-query.&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let prefix = null; // Object | 
let dashboardTemplate = null; // Object | invalid value for dashboard template name
let comparisonEntity = "comparisonEntity_example"; // String | Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateCompareComparisonEntityComparisonEntityIdOrQueryGet(entity, entityIdOrQuery, prefix, dashboardTemplate, comparisonEntity, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **prefix** | [**Object**](.md)|  | 
 **dashboardTemplate** | [**Object**](.md)| invalid value for dashboard template name | 
 **comparisonEntity** | **String**| Invalid comparison entity type. Can only be one of \&quot;table\&quot;, \&quot;segment\&quot;, or \&quot;adhoc\&quot; | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateGet

> apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateGet(entity, entityIdOrQuery, prefix, dashboardTemplate, opts)

GET /api/automagic-dashboards/{entity}/{entity-id-or-query}/rule/{prefix}/{dashboard-template}

Return an automagic dashboard for entity &#x60;entity&#x60; with id &#x60;id&#x60; using dashboard-template &#x60;dashboard-template&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let entity = "entity_example"; // String | 
let entityIdOrQuery = "entityIdOrQuery_example"; // String | value must be a non-blank string.
let prefix = null; // Object | 
let dashboardTemplate = null; // Object | invalid value for dashboard template name
let opts = {
  'show': new MetabaseApi.ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter() // ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter | invalid show value
};
apiInstance.apiAutomagicDashboardsEntityEntityIdOrQueryRulePrefixDashboardTemplateGet(entity, entityIdOrQuery, prefix, dashboardTemplate, opts, (error, data, response) => {
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
 **entity** | **String**|  | 
 **entityIdOrQuery** | **String**| value must be a non-blank string. | 
 **prefix** | [**Object**](.md)|  | 
 **dashboardTemplate** | [**Object**](.md)| invalid value for dashboard template name | 
 **show** | [**ApiAutomagicDashboardsEntityEntityIdOrQueryCellCellQueryGetShowParameter**](.md)| invalid show value | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiAutomagicDashboardsModelIndexModelIndexIdPrimaryKeyPkIdGet

> apiAutomagicDashboardsModelIndexModelIndexIdPrimaryKeyPkIdGet(modelIndexId, pkId)

GET /api/automagic-dashboards/model_index/{model-index-id}/primary_key/{pk-id}

Return an automagic dashboard for an entity detail specified by &#x60;entity&#x60;   with id &#x60;id&#x60; and a primary key of &#x60;indexed-value&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiAutomagicDashboardsApi();
let modelIndexId = 56; // Number | 
let pkId = 56; // Number | 
apiInstance.apiAutomagicDashboardsModelIndexModelIndexIdPrimaryKeyPkIdGet(modelIndexId, pkId, (error, data, response) => {
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
 **modelIndexId** | **Number**|  | 
 **pkId** | **Number**|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

