# MetabaseApi.ApiCardsApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiCardsDashboardsPost**](ApiCardsApi.md#apiCardsDashboardsPost) | **POST** /api/cards/dashboards | POST /api/cards/dashboards
[**apiCardsMovePost**](ApiCardsApi.md#apiCardsMovePost) | **POST** /api/cards/move | POST /api/cards/move



## apiCardsDashboardsPost

> apiCardsDashboardsPost(opts)

POST /api/cards/dashboards

Get the dashboards that multiple cards appear in. The response is a sequence of maps, each of which has a &#x60;card_id&#x60;   and &#x60;dashboards&#x60;. &#x60;dashboard&#x60; may include an &#x60;:error&#x60; key, either &#x60;:unreadable-dashboard&#x60; or   &#x60;:unwritable-dashboard&#x60;. In the case of an &#x60;unreadable-dashboard&#x60; the dashboard details (name, ID) will NOT be   present.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardsApi();
let opts = {
  'apiCardsDashboardsPostRequest': new MetabaseApi.ApiCardsDashboardsPostRequest() // ApiCardsDashboardsPostRequest | 
};
apiInstance.apiCardsDashboardsPost(opts, (error, data, response) => {
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
 **apiCardsDashboardsPostRequest** | [**ApiCardsDashboardsPostRequest**](ApiCardsDashboardsPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiCardsMovePost

> apiCardsMovePost(opts)

POST /api/cards/move

Moves a number of Cards to a single collection or dashboard.    For now, just either succeed or fail as a batch - we can think more about error handling later down the road.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiCardsApi();
let opts = {
  'apiCardsMovePostRequest': new MetabaseApi.ApiCardsMovePostRequest() // ApiCardsMovePostRequest | 
};
apiInstance.apiCardsMovePost(opts, (error, data, response) => {
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
 **apiCardsMovePostRequest** | [**ApiCardsMovePostRequest**](ApiCardsMovePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

