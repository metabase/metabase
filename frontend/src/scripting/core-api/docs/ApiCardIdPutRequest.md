# MetabaseApi.ApiCardIdPutRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**enableEmbedding** | **Boolean** |  | [optional] 
**visualizationSettings** | **Object** | Value must be a map. | [optional] 
**dashboardTabId** | **Number** | value must be an integer greater than zero. | [optional] 
**collectionPreview** | **Boolean** |  | [optional] 
**datasetQuery** | **Object** | Value must be a map. | [optional] 
**name** | **String** |  | [optional] 
**archived** | **Boolean** |  | [optional] 
**collectionPosition** | **Number** | value must be an integer greater than zero. | [optional] 
**embeddingParams** | **{String: String}** | value must be a valid embedding params map. | [optional] 
**resultMetadata** | [**[MetabaseAnalyzeQueryResultsResultColumnMetadata]**](MetabaseAnalyzeQueryResultsResultColumnMetadata.md) | value must be an array of valid results column metadata maps. | [optional] 
**collectionId** | **Number** | value must be an integer greater than zero. | [optional] 
**cacheTtl** | **Number** | value must be an integer greater than zero. | [optional] 
**type** | [**MetabaseApiCardCardType**](MetabaseApiCardCardType.md) |  | [optional] 
**display** | **String** |  | [optional] 
**parameters** | [**[ApiCardPostRequestParametersInner]**](ApiCardPostRequestParametersInner.md) |  | [optional] 
**description** | **String** |  | [optional] 
**dashboardId** | **Number** | value must be an integer greater than zero. | [optional] 



## Enum: {String: String}


* `disabled` (value: `"disabled"`)

* `enabled` (value: `"enabled"`)

* `locked` (value: `"locked"`)




