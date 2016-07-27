import * as Query from "metabase/meta/Query";

export function suggestObjectDetailView(query, resultRow, columnDefinitions){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		// if the row has a PK or FK
		// -> the detail view of that object  (subscore is always 1)
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          
suggestObjectDetailView.verboseName = "Suggested Object Detail View"