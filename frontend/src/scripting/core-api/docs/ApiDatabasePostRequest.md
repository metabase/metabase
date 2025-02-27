# MetabaseApi.ApiDatabasePostRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**name** | **String** |  | 
**isOnDemand** | **Boolean** |  | [optional] [default to false]
**cacheTtl** | **Number** | value must be an integer greater than zero. | [optional] 
**engine** | **String** |  | 
**details** | **Object** | Value must be a map. | 
**isFullSync** | **Boolean** |  | [optional] [default to true]
**connectionSource** | **String** |  | [optional] [default to &#39;admin&#39;]
**autoRunQueries** | **Boolean** |  | [optional] 
**schedules** | [**MetabaseSyncSchedulesExpandedSchedulesMap**](MetabaseSyncSchedulesExpandedSchedulesMap.md) |  | [optional] 



## Enum: ConnectionSourceEnum


* `admin` (value: `"admin"`)

* `setup` (value: `"setup"`)




