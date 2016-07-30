import _ from "underscore";
import * as Query from "metabase/meta/Query";
import {TableMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

export function suggestTableMetrics(query){
	const RECOMMENDER_NAME = "See common metric"
	
	if(!Query.isBareRowsAggregation(query)){
		// TODO Create new query
		var returnValues = []

		var underlyingTable = Query.getUnderlyingTable(query)
		if(TableMetadata.hasSegments(underlyingTable)){
			_.each(TableMetadata.getSegments(underlyingTable), function(metric){

			var new_query = Query.clone(query)
			new_query = Query.replaceAggregationWithMetric(query, metric)
			returnValues.push({target : new_query, 
							   source: RECOMMENDER_NAME, 
							   recommendation: "See " + metric.name, 
							   url: Query.toURL(new_query), 
							   score: 1})
			})
		}
		return returnValues
	}
}          

suggestTableMetrics.verboseName = "See common metric"