import _ from "underscore";
import * as Query from "metabase/meta/Query";


const RECOMMENDER_NAME = "Filter by Dimension"
const RECOMMENDER_WEIGHT = 50     
const LINKED_RECOMMENDER_WEIGHT = 30

50         Filter by an available time dimension
50         Filter by an available geo dimension (state, city, country)
50         Filter by an available category dimension
30         Filter by an available time dimension in a linked table
30         Filter by an available geo dimension (state, city, country)  in a linked table
30         Filter by an available category dimension in a linked table

     // data required:
     //      List of dimensions for the table in question

     // useful extra data:
     //      For the table in question - which dimension is most frequently used to filter
     //      For the given dimension - which value is most commonly used in a given dimension filter



function filter_by_time(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: RECOMMENDER_WEIGHT,  score: 1}]
}

function filter_by_geo(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: RECOMMENDER_WEIGHT,  score: 1}]
}

function filter_by_category(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: RECOMMENDER_WEIGHT,  score: 1}]
}

function filter_by_linked_time(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: LINKED_RECOMMENDER_WEIGHT,  score: 1}]
}

function filter_by_linked_geo(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: LINKED_RECOMMENDER_WEIGHT,  score: 1}]
}

function filter_by_linked_category(query){
	return [{target : new_query, source: RECOMMENDER_NAME, source_weight: LINKED_RECOMMENDER_WEIGHT,  score: 1}]
}

var sub_recommenders = [filter_by_time, 
						filter_by_geo, 
						filter_by_category, 
						filter_by_linked_time, 
						filter_by_linked_geo, 
						filter_by_linked_category]

export function recommend(query){

	return _.flatten(_.map(sub_recommenders))
}