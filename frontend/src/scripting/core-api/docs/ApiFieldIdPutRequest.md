# MetabaseApi.ApiFieldIdPutRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**pointsOfInterest** | **String** |  | [optional] 
**settings** | **Object** | Value must be a map. | [optional] 
**visibilityType** | **String** |  | [optional] 
**coercionStrategy** | **Object** |  | [optional] 
**jsonUnfolding** | **Boolean** |  | [optional] 
**semanticType** | **Object** |  | [optional] 
**hasFieldValues** | [**MetabaseLibSchemaMetadataColumnHasFieldValues**](MetabaseLibSchemaMetadataColumnHasFieldValues.md) |  | [optional] 
**displayName** | **String** |  | [optional] 
**nfcPath** | **[String]** |  | [optional] 
**caveats** | **String** |  | [optional] 
**description** | **String** |  | [optional] 
**fkTargetFieldId** | **Number** | value must be an integer greater than zero. | [optional] 



## Enum: VisibilityTypeEnum


* `retired` (value: `"retired"`)

* `sensitive` (value: `"sensitive"`)

* `normal` (value: `"normal"`)

* `hidden` (value: `"hidden"`)

* `details-only` (value: `"details-only"`)




