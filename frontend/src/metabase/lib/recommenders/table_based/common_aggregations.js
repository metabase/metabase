import * as Query from "metabase/meta/Query";

Common Aggregations
80      if the query is raw data: return count by a time dimension
80      if the query is raw data: return count by a region dimension
80      if the query is raw data: return count by a category dimension
60      if the query is raw data: return count distinct of PKs
50      if the query is raw data: return count distinct of FKs

     data required:
          List of dimensions for the table in question

     useful extra data:
          most aggregations performed on a given table or segment


export function recommendTableSegments(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          


export function recommendTableSegments(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          



export function recommendTableSegments(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          

export function recommendTableSegments(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}                    