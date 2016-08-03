import _ from "underscore";
import Query from "metabase/lib/Query";
import {TableMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

export function suggestTableMetrics(query){
	const RECOMMENDER_NAME = "See common metric"
	
	var returnValues = []

	var underlyingTable = Query.getUnderlyingTable(query)
	if(TableMetadata.hasMetrics(underlyingTable)){
		_.each(TableMetadata.getMetrics(underlyingTable), function(metric){

		var new_query = Query.clone(query)
		new_query = Query.replaceAggregationWithMetric(query, metric)
		returnValues.push({source: RECOMMENDER_NAME, 
						   recommendation: "See " + metric.name, 
						   url: Query.toURL(new_query), 
						   score: 1})
		})
	}
	return returnValues
	
}          

suggestTableMetrics.verboseName = "See common metric"