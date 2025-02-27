# MetabaseApi.ApiCollectionApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiCollectionGet**](ApiCollectionApi.md#apiCollectionGet) | **GET** /api/collection/ | GET /api/collection/
[**apiCollectionGraphGet**](ApiCollectionApi.md#apiCollectionGraphGet) | **GET** /api/collection/graph | GET /api/collection/graph
[**apiCollectionGraphPut**](ApiCollectionApi.md#apiCollectionGraphPut) | **PUT** /api/collection/graph | PUT /api/collection/graph
[**apiCollectionIdDashboardQuestionCandidatesGet**](ApiCollectionApi.md#apiCollectionIdDashboardQuestionCandidatesGet) | **GET** /api/collection/{id}/dashboard-question-candidates | GET /api/collection/{id}/dashboard-question-candidates
[**apiCollectionIdGet**](ApiCollectionApi.md#apiCollectionIdGet) | **GET** /api/collection/{id} | GET /api/collection/{id}
[**apiCollectionIdItemsGet**](ApiCollectionApi.md#apiCollectionIdItemsGet) | **GET** /api/collection/{id}/items | GET /api/collection/{id}/items
[**apiCollectionIdMoveDashboardQuestionCandidatesPost**](ApiCollectionApi.md#apiCollectionIdMoveDashboardQuestionCandidatesPost) | **POST** /api/collection/{id}/move-dashboard-question-candidates | POST /api/collection/{id}/move-dashboard-question-candidates
[**apiCollectionIdPut**](ApiCollectionApi.md#apiCollectionIdPut) | **PUT** /api/collection/{id} | PUT /api/collection/{id}
[**apiCollectionPost**](ApiCollectionApi.md#apiCollectionPost) | **POST** /api/collection/ | POST /api/collection/
[**apiCollectionRootDashboardQuestionCandidatesGet**](ApiCollectionApi.md#apiCollectionRootDashboardQuestionCandidatesGet) | **GET** /api/collection/root/dashboard-question-candidates | GET /api/collection/root/dashboard-question-candidates
[**apiCollectionRootGet**](ApiCollectionApi.md#apiCollectionRootGet) | **GET** /api/collection/root | GET /api/collection/root
[**apiCollectionRootItemsGet**](ApiCollectionApi.md#apiCollectionRootItemsGet) | **GET** /api/collection/root/items | GET /api/collection/root/items
[**apiCollectionRootMoveDashboardQuestionCandidatesPost**](ApiCollectionApi.md#apiCollectionRootMoveDashboardQuestionCandidatesPost) | **POST** /api/collection/root/move-dashboard-question-candidates | POST /api/collection/root/move-dashboard-question-candidates
[**apiCollectionTrashGet**](ApiCollectionApi.md#apiCollectionTrashGet) | **GET** /api/collection/trash | GET /api/collection/trash
[**apiCollectionTreeGet**](ApiCollectionApi.md#apiCollectionTreeGet) | **GET** /api/collection/tree | GET /api/collection/tree



## apiCollectionGet

> apiCollectionGet(opts)

GET /api/collection/

Fetch a list of all Collections that the current user has read permissions for (&#x60;:can_write&#x60; is returned as an   additional property of each Collection so you can tell which of these you have write permissions for.)    By default, this returns non-archived Collections, but instead you can show archived ones by passing   &#x60;?archived&#x3D;true&#x60;.    By default, admin users will see all collections. To hide other user&#39;s collections pass in   &#x60;?exclude-other-user-collections&#x3D;true&#x60;.    If personal-only is &#x60;true&#x60;, then return only personal collections where &#x60;personal_owner_id&#x60; is not &#x60;nil&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'archived': false, // Boolean | 
  'excludeOtherUserCollections': false, // Boolean | 
  'namespace': "namespace_example", // String | value must be a non-blank string.
  'personalOnly': false // Boolean | 
};
apiInstance.apiCollectionGet(opts, (error, data, response) => {
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
 **archived** | **Boolean**|  | [optional] [default to false]
 **excludeOtherUserCollections** | **Boolean**|  | [optional] [default to false]
 **namespace** | **String**| value must be a non-blank string. | [optional] 
 **personalOnly** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCollectionGraphGet

> apiCollectionGraphGet(opts)

GET /api/collection/graph

Fetch a graph of all Collection Permissions.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'namespace': "namespace_example" // String | value must be a non-blank string.
};
apiInstance.apiCollectionGraphGet(opts, (error, data, response) => {
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
 **namespace** | **String**| value must be a non-blank string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCollectionGraphPut

> apiCollectionGraphPut(opts)

PUT /api/collection/graph

Do a batch update of Collections Permissions by passing in a modified graph. Will overwrite parts of the graph that   are present in the request, and leave the rest unchanged.    If the &#x60;force&#x60; query parameter is &#x60;true&#x60;, a &#x60;revision&#x60; number is not required. The provided graph will be persisted   as-is, and has the potential to clobber other writes that happened since the last read.    If the &#x60;skip_graph&#x60; query parameter is &#x60;true&#x60;, it will only return the current revision, not the entire permissions   graph.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'force': false, // Boolean | 
  'skipGraph': false, // Boolean | 
  'apiCollectionGraphPutRequest': new MetabaseApi.ApiCollectionGraphPutRequest() // ApiCollectionGraphPutRequest | 
};
apiInstance.apiCollectionGraphPut(opts, (error, data, response) => {
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
 **force** | **Boolean**|  | [optional] [default to false]
 **skipGraph** | **Boolean**|  | [optional] [default to false]
 **apiCollectionGraphPutRequest** | [**ApiCollectionGraphPutRequest**](ApiCollectionGraphPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCollectionIdDashboardQuestionCandidatesGet

> apiCollectionIdDashboardQuestionCandidatesGet(id)

GET /api/collection/{id}/dashboard-question-candidates

Find cards in this collection that can be moved into dashboards in this collection.    To be eligible, a card must only appear in one dashboard (which is also in this collection), and must not already be a   dashboard question.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCollectionIdDashboardQuestionCandidatesGet(id, (error, data, response) => {
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


## apiCollectionIdGet

> apiCollectionIdGet(id)

GET /api/collection/{id}

Fetch a specific Collection with standard details added

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiCollectionIdGet(id, (error, data, response) => {
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


## apiCollectionIdItemsGet

> apiCollectionIdItemsGet(id, opts)

GET /api/collection/{id}/items

Fetch a specific Collection&#39;s items with the following options:    *  &#x60;models&#x60; - only include objects of a specific set of &#x60;models&#x60;. If unspecified, returns objects of all models   *  &#x60;archived&#x60; - when &#x60;true&#x60;, return archived objects *instead* of unarchived ones. Defaults to &#x60;false&#x60;.   *  &#x60;pinned_state&#x60; - when &#x60;is_pinned&#x60;, return pinned objects only.                    when &#x60;is_not_pinned&#x60;, return non pinned objects only.                    when &#x60;all&#x60;, return everything. By default returns everything.    Note that this endpoint should return results in a similar shape to &#x60;/api/dashboard/:id/items&#x60;, so if this is   changed, that should too.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'models': ["null"], // [String] | 
  'archived': false, // Boolean | 
  'pinnedState': "pinnedState_example", // String | 
  'sortColumn': "sortColumn_example", // String | 
  'sortDirection': "sortDirection_example", // String | 
  'officialCollectionsFirst': true, // Boolean | 
  'showDashboardQuestions': false // Boolean | 
};
apiInstance.apiCollectionIdItemsGet(id, opts, (error, data, response) => {
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
 **models** | [**[String]**](String.md)|  | [optional] 
 **archived** | **Boolean**|  | [optional] [default to false]
 **pinnedState** | **String**|  | [optional] 
 **sortColumn** | **String**|  | [optional] 
 **sortDirection** | **String**|  | [optional] 
 **officialCollectionsFirst** | **Boolean**|  | [optional] 
 **showDashboardQuestions** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCollectionIdMoveDashboardQuestionCandidatesPost

> apiCollectionIdMoveDashboardQuestionCandidatesPost(id, opts)

POST /api/collection/{id}/move-dashboard-question-candidates

Move candidate cards to the dashboards they appear in.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiCollectionIdMoveDashboardQuestionCandidatesPostRequest': new MetabaseApi.ApiCollectionIdMoveDashboardQuestionCandidatesPostRequest() // ApiCollectionIdMoveDashboardQuestionCandidatesPostRequest | 
};
apiInstance.apiCollectionIdMoveDashboardQuestionCandidatesPost(id, opts, (error, data, response) => {
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
 **apiCollectionIdMoveDashboardQuestionCandidatesPostRequest** | [**ApiCollectionIdMoveDashboardQuestionCandidatesPostRequest**](ApiCollectionIdMoveDashboardQuestionCandidatesPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCollectionIdPut

> apiCollectionIdPut(id, opts)

PUT /api/collection/{id}

Modify an existing Collection, including archiving or unarchiving it, or moving it.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiCollectionIdPutRequest': new MetabaseApi.ApiCollectionIdPutRequest() // ApiCollectionIdPutRequest | 
};
apiInstance.apiCollectionIdPut(id, opts, (error, data, response) => {
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
 **apiCollectionIdPutRequest** | [**ApiCollectionIdPutRequest**](ApiCollectionIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCollectionPost

> apiCollectionPost(opts)

POST /api/collection/

Create a new Collection.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'apiCollectionPostRequest': new MetabaseApi.ApiCollectionPostRequest() // ApiCollectionPostRequest | 
};
apiInstance.apiCollectionPost(opts, (error, data, response) => {
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
 **apiCollectionPostRequest** | [**ApiCollectionPostRequest**](ApiCollectionPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCollectionRootDashboardQuestionCandidatesGet

> apiCollectionRootDashboardQuestionCandidatesGet()

GET /api/collection/root/dashboard-question-candidates

Find cards in the root collection that can be moved into dashboards in the root collection. (Same as the above   endpoint, but for the root collection)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
apiInstance.apiCollectionRootDashboardQuestionCandidatesGet((error, data, response) => {
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


## apiCollectionRootGet

> apiCollectionRootGet(opts)

GET /api/collection/root

Return the &#39;Root&#39; Collection object with standard details added

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'namespace': "namespace_example" // String | value must be a non-blank string.
};
apiInstance.apiCollectionRootGet(opts, (error, data, response) => {
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
 **namespace** | **String**| value must be a non-blank string. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCollectionRootItemsGet

> apiCollectionRootItemsGet(opts)

GET /api/collection/root/items

Fetch objects that the current user should see at their root level. As mentioned elsewhere, the &#39;Root&#39; Collection   doesn&#39;t actually exist as a row in the application DB: it&#39;s simply a virtual Collection where things with no   &#x60;collection_id&#x60; exist. It does, however, have its own set of Permissions.    This endpoint will actually show objects with no &#x60;collection_id&#x60; for Users that have Root Collection   permissions, but for people without Root Collection perms, we&#39;ll just show the objects that have an effective   location of &#x60;/&#x60;.    This endpoint is intended to power a &#39;Root Folder View&#39; for the Current User, so regardless you&#39;ll see all the   top-level objects you&#39;re allowed to access.    By default, this will show the &#39;normal&#39; Collections namespace; to view a different Collections namespace, such as   &#x60;snippets&#x60;, you can pass the &#x60;?namespace&#x3D;&#x60; parameter.    Note that this endpoint should return results in a similar shape to &#x60;/api/dashboard/:id/items&#x60;, so if this is   changed, that should too.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'models': ["null"], // [String] | 
  'archived': false, // Boolean | 
  'namespace': "namespace_example", // String | value must be a non-blank string.
  'pinnedState': "pinnedState_example", // String | 
  'sortColumn': "sortColumn_example", // String | 
  'sortDirection': "sortDirection_example", // String | 
  'officialCollectionsFirst': true, // Boolean | 
  'showDashboardQuestions': true // Boolean | 
};
apiInstance.apiCollectionRootItemsGet(opts, (error, data, response) => {
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
 **models** | [**[String]**](String.md)|  | [optional] 
 **archived** | **Boolean**|  | [optional] [default to false]
 **namespace** | **String**| value must be a non-blank string. | [optional] 
 **pinnedState** | **String**|  | [optional] 
 **sortColumn** | **String**|  | [optional] 
 **sortDirection** | **String**|  | [optional] 
 **officialCollectionsFirst** | **Boolean**|  | [optional] 
 **showDashboardQuestions** | **Boolean**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiCollectionRootMoveDashboardQuestionCandidatesPost

> apiCollectionRootMoveDashboardQuestionCandidatesPost(opts)

POST /api/collection/root/move-dashboard-question-candidates

Move candidate cards to the dashboards they appear in (for the root collection)

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'apiCollectionRootMoveDashboardQuestionCandidatesPostRequest': new MetabaseApi.ApiCollectionRootMoveDashboardQuestionCandidatesPostRequest() // ApiCollectionRootMoveDashboardQuestionCandidatesPostRequest | 
};
apiInstance.apiCollectionRootMoveDashboardQuestionCandidatesPost(opts, (error, data, response) => {
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
 **apiCollectionRootMoveDashboardQuestionCandidatesPostRequest** | [**ApiCollectionRootMoveDashboardQuestionCandidatesPostRequest**](ApiCollectionRootMoveDashboardQuestionCandidatesPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCollectionTrashGet

> apiCollectionTrashGet()

GET /api/collection/trash

Fetch the trash collection, as in &#x60;/api/collection/:trash-id&#x60;

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
apiInstance.apiCollectionTrashGet((error, data, response) => {
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


## apiCollectionTreeGet

> apiCollectionTreeGet(opts)

GET /api/collection/tree

Similar to &#x60;GET /&#x60;, but returns Collections in a tree structure, e.g.    &#x60;&#x60;&#x60;   [{:name     \&quot;A\&quot;   :below    #{:card :dataset}   :children [{:name \&quot;B\&quot;}              {:name     \&quot;C\&quot;               :here     #{:dataset :card}               :below    #{:dataset :card}               :children [{:name     \&quot;D\&quot;                           :here     #{:dataset}                           :children [{:name \&quot;E\&quot;}]}                          {:name     \&quot;F\&quot;                           :here     #{:card}                           :children [{:name \&quot;G\&quot;}]}]}]}   {:name \&quot;H\&quot;}]   &#x60;&#x60;&#x60;    The here and below keys indicate the types of items at this particular level of the tree (here) and in its   subtree (below).    TODO: for historical reasons this returns Saved Questions AS &#39;card&#39; AND Models as &#39;dataset&#39;; we should fix this at   some point in the future.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCollectionApi();
let opts = {
  'excludeArchived': false, // Boolean | 
  'excludeOtherUserCollections': false, // Boolean | 
  'namespace': "namespace_example", // String | value must be a non-blank string.
  'shallow': false, // Boolean | 
  'collectionId': 56 // Number | value must be an integer greater than zero.
};
apiInstance.apiCollectionTreeGet(opts, (error, data, response) => {
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
 **excludeArchived** | **Boolean**|  | [optional] [default to false]
 **excludeOtherUserCollections** | **Boolean**|  | [optional] [default to false]
 **namespace** | **String**| value must be a non-blank string. | [optional] 
 **shallow** | **Boolean**|  | [optional] [default to false]
 **collectionId** | **Number**| value must be an integer greater than zero. | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

