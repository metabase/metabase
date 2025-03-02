# MetabaseApi.ApiLdapApi

All URIs are relative to *http://localhost:3000/api/docs*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiLdapSettingsPut**](ApiLdapApi.md#apiLdapSettingsPut) | **PUT** /api/ldap/settings | PUT /api/ldap/settings



## apiLdapSettingsPut

> apiLdapSettingsPut(opts)

PUT /api/ldap/settings

Update LDAP related settings. You must be a superuser to do this.

### Example

```javascript
import MetabaseApi from 'metabase_api';

let apiInstance = new MetabaseApi.ApiLdapApi();
let opts = {
  'body': {key: null} // Object | 
};
apiInstance.apiLdapSettingsPut(opts, (error, data, response) => {
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
 **body** | **Object**|  | [optional] 

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

