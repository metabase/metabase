# MetabaseApi.ApiActivityApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiActivityMostRecentlyViewedDashboardGet**](ApiActivityApi.md#apiActivityMostRecentlyViewedDashboardGet) | **GET** /api/activity/most_recently_viewed_dashboard | GET /api/activity/most_recently_viewed_dashboard
[**apiActivityPopularItemsGet**](ApiActivityApi.md#apiActivityPopularItemsGet) | **GET** /api/activity/popular_items | GET /api/activity/popular_items
[**apiActivityRecentViewsGet**](ApiActivityApi.md#apiActivityRecentViewsGet) | **GET** /api/activity/recent_views | GET /api/activity/recent_views
[**apiActivityRecentsGet**](ApiActivityApi.md#apiActivityRecentsGet) | **GET** /api/activity/recents | GET /api/activity/recents
[**apiActivityRecentsPost**](ApiActivityApi.md#apiActivityRecentsPost) | **POST** /api/activity/recents | POST /api/activity/recents



## apiActivityMostRecentlyViewedDashboardGet

> apiActivityMostRecentlyViewedDashboardGet()

GET /api/activity/most_recently_viewed_dashboard

Get the most recently viewed dashboard for the current user. Returns a 204 if the user has not viewed any dashboards    in the last 24 hours.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActivityApi();
apiInstance.apiActivityMostRecentlyViewedDashboardGet((error, data, response) => {
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


## apiActivityPopularItemsGet

> apiActivityPopularItemsGet()

GET /api/activity/popular_items

Get the list of 5 popular things on the instance. Query takes 8 and limits to 5 so that if it finds anything   archived, deleted, etc it can usually still get 5. 

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActivityApi();
apiInstance.apiActivityPopularItemsGet((error, data, response) => {
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


## apiActivityRecentViewsGet

> apiActivityRecentViewsGet()

GET /api/activity/recent_views

Get a list of 100 models (cards, models, tables, dashboards, and collections) that the current user has been viewing most   recently. Return a maximum of 20 model of each, if they&#39;ve looked at at least 20.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActivityApi();
apiInstance.apiActivityRecentViewsGet((error, data, response) => {
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


## apiActivityRecentsGet

> apiActivityRecentsGet(context)

GET /api/activity/recents

Get a list of recent items the current user has been viewing most recently under the &#x60;:recents&#x60; key.   Allows for filtering by context: views or selections

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActivityApi();
let context = ["null"]; // [String] | 
apiInstance.apiActivityRecentsGet(context, (error, data, response) => {
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
 **context** | [**[String]**](String.md)|  | 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiActivityRecentsPost

> apiActivityRecentsPost(opts)

POST /api/activity/recents

Adds a model to the list of recently selected items.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiActivityApi();
let opts = {
  'apiActivityRecentsPostRequest': new MetabaseApi.ApiActivityRecentsPostRequest() // ApiActivityRecentsPostRequest | 
};
apiInstance.apiActivityRecentsPost(opts, (error, data, response) => {
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
 **apiActivityRecentsPostRequest** | [**ApiActivityRecentsPostRequest**](ApiActivityRecentsPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

