import _ from "underscore";

import * as Query from "metabase/meta/Query";

     // useful extra data:
     //      Most common time granularity for the dimension in question



export function suggestDifferentTimeGranularity(query){
	const RECOMMENDER_NAME = "Suggest different granularity"
	if(!Query.isBrokenOutByTime(query)){
		var allTimeGranularities = Query.getTimeGranularities()
		var currentGranularity = Query.getTimeGranularity(query)
		var allValidGranularities = _.filter(allTimeGranularities, function(granularity){return granularity==currentGranularity})	
		
		var returnValues =  []

		_.each(allValidGranularities, function(granularity){
			var new_query = Query.clone(query)
			Query.changeTimeGranularity(new_query, granularity)
			
			returnValues.push({target : new_query, 
							   source: RECOMMENDER_NAME, 
							   recommendation: "See by " + granularity + "instead" , 
							   url: Query.toURL(new_query), 
							   score: 1})
		})

		return returnValues
	}
}                    

suggestDifferentTimeGranularity.verboseName = "Suggest different granularity"