# MetabaseApi.ApiDashboardIdPutRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**pointsOfInterest** | **String** |  | [optional] 
**enableEmbedding** | **Boolean** |  | [optional] 
**width** | **String** |  | [optional] 
**showInGettingStarted** | **Boolean** |  | [optional] 
**position** | **Number** | value must be an integer greater than zero. | [optional] 
**name** | **String** |  | [optional] 
**archived** | **Boolean** |  | [optional] 
**collectionPosition** | **Number** | value must be an integer greater than zero. | [optional] 
**embeddingParams** | **{String: String}** | value must be a valid embedding params map. | [optional] 
**tabs** | [**[ApiDashboardIdPutRequestTabsInner]**](ApiDashboardIdPutRequestTabsInner.md) | value must be seq of maps in which ids are unique | [optional] 
**collectionId** | **Number** | value must be an integer greater than zero. | [optional] 
**cacheTtl** | **Number** | value must be an integer greater than zero. | [optional] 
**caveats** | **String** |  | [optional] 
**parameters** | [**[ApiCardPostRequestParametersInner]**](ApiCardPostRequestParametersInner.md) |  | [optional] 
**dashcards** | [**[ApiDashboardIdPutRequestDashcardsInner]**](ApiDashboardIdPutRequestDashcardsInner.md) | value must be seq of maps in which ids are unique | [optional] 
**description** | **String** |  | [optional] 



## Enum: WidthEnum


* `fixed` (value: `"fixed"`)

* `full` (value: `"full"`)





## Enum: {String: String}


* `disabled` (value: `"disabled"`)

* `enabled` (value: `"enabled"`)

* `locked` (value: `"locked"`)




