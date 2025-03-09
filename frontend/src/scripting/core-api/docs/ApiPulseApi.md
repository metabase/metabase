# MetabaseApi.ApiPulseApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiPulseFormInputGet**](ApiPulseApi.md#apiPulseFormInputGet) | **GET** /api/pulse/form_input | GET /api/pulse/form_input
[**apiPulseGet**](ApiPulseApi.md#apiPulseGet) | **GET** /api/pulse/ | GET /api/pulse/
[**apiPulseIdGet**](ApiPulseApi.md#apiPulseIdGet) | **GET** /api/pulse/{id} | GET /api/pulse/{id}
[**apiPulseIdPut**](ApiPulseApi.md#apiPulseIdPut) | **PUT** /api/pulse/{id} | PUT /api/pulse/{id}
[**apiPulseIdSubscriptionDelete**](ApiPulseApi.md#apiPulseIdSubscriptionDelete) | **DELETE** /api/pulse/{id}/subscription | DELETE /api/pulse/{id}/subscription
[**apiPulsePost**](ApiPulseApi.md#apiPulsePost) | **POST** /api/pulse/ | POST /api/pulse/
[**apiPulsePreviewCardIdGet**](ApiPulseApi.md#apiPulsePreviewCardIdGet) | **GET** /api/pulse/preview_card/{id} | GET /api/pulse/preview_card/{id}
[**apiPulsePreviewCardInfoIdGet**](ApiPulseApi.md#apiPulsePreviewCardInfoIdGet) | **GET** /api/pulse/preview_card_info/{id} | GET /api/pulse/preview_card_info/{id}
[**apiPulsePreviewCardPngIdGet**](ApiPulseApi.md#apiPulsePreviewCardPngIdGet) | **GET** /api/pulse/preview_card_png/{id} | GET /api/pulse/preview_card_png/{id}
[**apiPulsePreviewDashboardIdGet**](ApiPulseApi.md#apiPulsePreviewDashboardIdGet) | **GET** /api/pulse/preview_dashboard/{id} | GET /api/pulse/preview_dashboard/{id}
[**apiPulseTestPost**](ApiPulseApi.md#apiPulseTestPost) | **POST** /api/pulse/test | POST /api/pulse/test



## apiPulseFormInputGet

> apiPulseFormInputGet()

GET /api/pulse/form_input

Provides relevant configuration information and user choices for creating/updating Pulses.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
apiInstance.apiPulseFormInputGet((error, data, response) => {
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


## apiPulseGet

> apiPulseGet(opts)

GET /api/pulse/

Fetch all dashboard subscriptions. By default, returns only subscriptions for which the current user has write   permissions. For admins, this is all subscriptions; for non-admins, it is only subscriptions that they created.    If &#x60;dashboard_id&#x60; is specified, restricts results to subscriptions for that dashboard.    If &#x60;created_or_receive&#x60; is &#x60;true&#x60;, it specifically returns all subscriptions for which the current user   created *or* is a known recipient of. Note that this is a superset of the default items returned for non-admins,   and a subset of the default items returned for admins. This is used to power the /account/notifications page.   This may include subscriptions which the current user does not have collection permissions for, in which case   some sensitive metadata (the list of cards and recipients) is stripped out.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let opts = {
  'archived': false, // Boolean | 
  'dashboardId': 56, // Number | value must be an integer greater than zero.
  'creatorOrRecipient': false // Boolean | 
};
apiInstance.apiPulseGet(opts, (error, data, response) => {
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
 **dashboardId** | **Number**| value must be an integer greater than zero. | [optional] 
 **creatorOrRecipient** | **Boolean**|  | [optional] [default to false]

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined


## apiPulseIdGet

> apiPulseIdGet(id)

GET /api/pulse/{id}

Fetch &#x60;Pulse&#x60; with ID. If the user is a recipient of the Pulse but does not have read permissions for its collection,   we still return it but with some sensitive metadata removed.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulseIdGet(id, (error, data, response) => {
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


## apiPulseIdPut

> apiPulseIdPut(id, opts)

PUT /api/pulse/{id}

Update a Pulse with &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
let opts = {
  'apiPulseIdPutRequest': new MetabaseApi.ApiPulseIdPutRequest() // ApiPulseIdPutRequest | 
};
apiInstance.apiPulseIdPut(id, opts, (error, data, response) => {
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
 **apiPulseIdPutRequest** | [**ApiPulseIdPutRequest**](ApiPulseIdPutRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPulseIdSubscriptionDelete

> apiPulseIdSubscriptionDelete(id)

DELETE /api/pulse/{id}/subscription

For users to unsubscribe themselves from a pulse subscription.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulseIdSubscriptionDelete(id, (error, data, response) => {
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


## apiPulsePost

> apiPulsePost(opts)

POST /api/pulse/

Create a new &#x60;Pulse&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let opts = {
  'apiPulsePostRequest': new MetabaseApi.ApiPulsePostRequest() // ApiPulsePostRequest | 
};
apiInstance.apiPulsePost(opts, (error, data, response) => {
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
 **apiPulsePostRequest** | [**ApiPulsePostRequest**](ApiPulsePostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined


## apiPulsePreviewCardIdGet

> apiPulsePreviewCardIdGet(id)

GET /api/pulse/preview_card/{id}

Get HTML rendering of a Card with &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulsePreviewCardIdGet(id, (error, data, response) => {
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


## apiPulsePreviewCardInfoIdGet

> apiPulsePreviewCardInfoIdGet(id)

GET /api/pulse/preview_card_info/{id}

Get JSON object containing HTML rendering of a Card with &#x60;id&#x60; and other information.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulsePreviewCardInfoIdGet(id, (error, data, response) => {
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


## apiPulsePreviewCardPngIdGet

> apiPulsePreviewCardPngIdGet(id)

GET /api/pulse/preview_card_png/{id}

Get PNG rendering of a Card with &#x60;id&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulsePreviewCardPngIdGet(id, (error, data, response) => {
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


## apiPulsePreviewDashboardIdGet

> apiPulsePreviewDashboardIdGet(id)

GET /api/pulse/preview_dashboard/{id}

Get HTML rendering of a Dashboard with &#x60;id&#x60;.    This endpoint relies on a custom middleware defined in &#x60;metabase.channel.render.core/style-tag-nonce-middleware&#x60; to   allow the style tag to render properly, given our Content Security Policy setup. This middleware is attached to these   routes at the bottom of this namespace using &#x60;metabase.api.common/define-routes&#x60;.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let id = 56; // Number | value must be an integer greater than zero.
apiInstance.apiPulsePreviewDashboardIdGet(id, (error, data, response) => {
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


## apiPulseTestPost

> apiPulseTestPost(opts)

POST /api/pulse/test

Test send an unsaved pulse.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiPulseApi();
let opts = {
  'apiPulseTestPostRequest': new MetabaseApi.ApiPulseTestPostRequest() // ApiPulseTestPostRequest | 
};
apiInstance.apiPulseTestPost(opts, (error, data, response) => {
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
 **apiPulseTestPostRequest** | [**ApiPulseTestPostRequest**](ApiPulseTestPostRequest.md)|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

