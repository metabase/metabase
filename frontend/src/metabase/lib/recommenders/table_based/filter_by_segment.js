import _ from "underscore";
import Query from "metabase/lib/Query";
import {TableMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

// useful extra data:
//      most commonly applied segments

export function suggestTableSegments(query){
	const RECOMMENDER_NAME = "Filter by a segment"
	
	if(!Query.isBareRowsAggregation(query)){
		// TODO Create new query
		var returnValues = []

		var underlyingTable = Query.getUnderlyingTable(query)
		// if query’s underlying table has segments
		if(TableMetadata.hasSegments(underlyingTable)){
		// -> filter by these segments
			_.each(TableMetadata.getSegments(underlyingTable), function(segment){

			var new_query = Query.clone(query)
			new_query = Query.filterBySegment(query, segment)
			returnValues.push({target : new_query, 
							   source: RECOMMENDER_NAME, 
							   recommendation: "Filter down to " + segment.name, 
							   url: Query.toURL(new_query), 
							   score: 1})
			})
		}
		return returnValues
	}
}          

suggestTableSegments.verboseName = "Filter by a segment"