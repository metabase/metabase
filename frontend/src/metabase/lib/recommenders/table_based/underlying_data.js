import * as Query from "metabase/meta/Query";

// if query is an aggregate -> `go to raw data`  (subscore is always 1)
// eg. this should always be shown

export function suggestUnderlyingData(query){
	
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// having to reach in and set "rows" manually is fugly
		// TODO Refactor me
		Query.updateAggregation(query, ["rows"])
		return [{target : new_query, source: RECOMMENDER_NAME,  score: 1}]
	}
}

suggestUnderlyingData.verboseName = "Underlying data"