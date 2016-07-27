import * as Query from "metabase/meta/Query";

     // data required:
     //      lookup table of dashboards that take a given field as a parameter
     //      lookup table of cards that take a given field as a parameter

     // useful extra data:
     //      most commonly viewed parameterized cards
     //           bonus points: when that parameter is filled out (vs just using the default)
     //           bonus points: when parameterized by that ID
     //      most commonly viewed parameterized dashboards


export function suggestDashboardParameterizedByID(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		// if the row has a PK or FK
		//  -> find all dashboards that take that as a parameter
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}          
suggestDashboardParameterizedByID.verboseName =  "Suggest Dashboards with ID Parameters" 

export function suggestCardParameterizedByID(query){
	if(!Query.isBareRowsAggregation(query)){
		new_query = Query.clone(query)
		// TODO Create new query
		// if the row has a PK or FK
		//  -> find all cards that take that as a parameter
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	}
}                    
suggestCardParameterizedByID.verboseName =  "Suggest Cards with ID Parameters" 
