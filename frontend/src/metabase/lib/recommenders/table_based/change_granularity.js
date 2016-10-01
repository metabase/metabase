import _ from "underscore";

import Query from "metabase/lib/Query";

     // useful extra data:
     //      Most common time granularity for the dimension in question



export function suggestDifferentTimeGranularity(query){
	const RECOMMENDER_NAME = "Suggest different granularity"
	var returnValues =  []
	if(Query.isBrokenOutByTime(query)){
		var allTimeGranularities = Query.getAllTimeGranularities()
		var currentGranularity = Query.getTimeGranularity(query)
		var allValidGranularities = _.filter(allTimeGranularities, function(granularity){return granularity != currentGranularity})	
		_.each(allValidGranularities, function(granularity){
			var new_query = Query.clone(query)
			Query.changeTimeGranularity(new_query, granularity)
			
			returnValues.push({target : new_query, 
							   source: RECOMMENDER_NAME, 
							   recommendation: "See by " + granularity + " instead" , 
							   url: Query.toURL(new_query), 
							   score: 1})
		})
	}
	return returnValues
}                    

suggestDifferentTimeGranularity.verboseName = "Suggest different granularity"