import * as Query from "metabase/meta/Query";

     // data required:
     //      All time dimensions in the currently queried table

     // useful extra data:
     //      Most common time granularity for the dimension in question



export function suggestDifferentTimeGranularity(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		// if query is grouped by a datetime 
		// -> show other granularities
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}                    

suggestDifferentTimeGranularity.verboseName = "Change granularity"