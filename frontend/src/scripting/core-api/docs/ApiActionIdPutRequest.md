# MetabaseApi.ApiActionIdPutRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**visualizationSettings** | **Object** |  | [optional] 
**responseHandle** | **String** |  | [optional] 
**datasetQuery** | **Object** |  | [optional] 
**parameterMappings** | **Object** |  | [optional] 
**name** | **String** |  | [optional] 
**archived** | **Boolean** |  | [optional] 
**databaseId** | **Number** | value must be an integer greater than zero. | [optional] 
**kind** | **String** | Unsupported implicit action kind | [optional] 
**type** | **String** | Unsupported action type | [optional] 
**template** | [**ApiActionIdPutRequestTemplate**](ApiActionIdPutRequestTemplate.md) |  | [optional] 
**errorHandle** | **String** |  | [optional] 
**modelId** | **Number** | value must be an integer greater than zero. | [optional] 
**parameters** | **[Object]** |  | [optional] 
**description** | **String** |  | [optional] 



## Enum: KindEnum


* `row/create` (value: `"row/create"`)

* `row/update` (value: `"row/update"`)

* `row/delete` (value: `"row/delete"`)

* `bulk/create` (value: `"bulk/create"`)

* `bulk/update` (value: `"bulk/update"`)

* `bulk/delete` (value: `"bulk/delete"`)





## Enum: TypeEnum


* `http` (value: `"http"`)

* `query` (value: `"query"`)

* `implicit` (value: `"implicit"`)




