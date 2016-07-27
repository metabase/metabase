import * as Query from "metabase/meta/Query";

     // data required:
     //      All segments that belong to the table a query is hitting

     // useful extra data:
     //      most commonly applied segments



export function suggestTableSegments(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		// if query’s underlying table has segments
		// -> filter by these segments
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          

suggestTableSegments.verboseName = "Filter by a segment"