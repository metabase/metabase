import _ from "underscore";

import Query from "metabase/lib/Query";
import { TableMetadata, FieldMetadata } from "metabase/lib/recommenders/thingsThatWouldBeUseful"

// Common Aggregations
// 80      if the query is raw data: return count by a time dimension
// 80      if the query is raw data: return count by a region dimension
// 80      if the query is raw data: return count by a category dimension
// 60      if the query is raw data: return count distinct of PKs
// 50      if the query is raw data: return count distinct of FKs

//      data required:
//           List of dimensions for the table in question

//      useful extra data:
//           most aggregations performed on a given table or segment


export function suggestCountByTime(query){
	const RECOMMENDER_NAME = "Suggest count by time"
		var allFields = TableMetadata.getFields(Query.getUnderlyingTable(query))
		var timeFields = _.filter(allFields, function(field){return FieldMetadata.isTime(field)})
		var returnValues = []

		_.each(timeFields, function(timeField){
			var new_query = Query.clone(query)
			Query.updateAggregation(new_query, ["count"])
			Query.replaceBreakout(new_query, timeField)
			
			returnValues.push({target : new_query, 
					 source: RECOMMENDER_NAME, 
					 recommendation: "See count by " + timeField.name, 
					 url: Query.toURL(new_query),
					 score: 1})
		})
		return returnValues
}          
suggestCountByTime.verboseName = "Suggest count by time"

export function suggestCountByGeo(query){
	const RECOMMENDER_NAME = "Suggest Count by Geo"
		var allFields = TableMetadata.getFields(Query.getUnderlyingTable(query))
		var geoFields = _.filter(allFields, function(field){return FieldMetadata.isGeo(field)})
		var returnValues = []

		_.each(geoFields, function(geoField){
			var new_query = Query.clone(query)
			Query.updateAggregation(new_query, ["count"])
			Query.replaceBreakout(new_query, geoField)
			
			returnValues.push({target : new_query, 
					 source: RECOMMENDER_NAME, 
					 recommendation: "See count by " + geoField.name, 
					 url: Query.toURL(new_query),
					 score: 1})			
		})
		return returnValues
}          

suggestCountByGeo.verboseName = "Suggest Count by Geo"

export function suggestCountByCategory(query){
	const RECOMMENDER_NAME = "Suggest Count by category"
	var allFields = TableMetadata.getFields(Query.getUnderlyingTable(query))
	var categoryFields = _.filter(allFields, function(field){return FieldMetadata.isCategory(field)})
	var returnValues = []

	_.each(categoryFields, function(categoryField){
		var new_query = Query.clone(query)
		Query.updateAggregation(new_query, ["count"])
		Query.replaceBreakout(new_query, categoryField)
		
		returnValues.push({target : new_query, 
				 source: RECOMMENDER_NAME, 
				 recommendation: "See count by " + categoryField.name, 
				 url: Query.toURL(new_query),
				 score: 1})			
	})
	return returnValues
}          
suggestCountByCategory.verboseName = "Suggest Count by category"



export function suggestCountDistinctOfEntityKeys(query){
	const RECOMMENDER_NAME = "Suggest distinct entities"
		var allFields = TableMetadata.getFields(Query.getUnderlyingTable(query))
		var idFields = _.filter(allFields, function(field){return FieldMetadata.isFK(field)})
		var returnValues = []

		_.each(idFields, function(idField){
			var new_query = Query.clone(query)
			Query.updateAggregation(new_query, ["distinct", idField.id])
			
			returnValues.push({target : new_query, 
					 source: RECOMMENDER_NAME, 
					 recommendation: "See distinct " + idField.name, 
					 url: Query.toURL(new_query),
					 score: 1})			
		})
	return returnValues
}          
suggestCountDistinctOfEntityKeys.verboseName = "Suggest distinct entities"