import _ from "underscore";

import * as Query from "metabase/meta/Query";

     // data required:
     //      All time dimensions in the currently queried table

     // useful extra data:
     //      Most common time granularity for the dimension in question



export function suggestDifferentTimeGranularity(query){
	const RECOMMENDER_NAME = "Change granularity"
	if(!Query.isBrokenOutByTime(query)){
		var allTimeGranularities = Query.getTimeGranularities()
		var currentGranularity = Query.getTimeGranularity(query)
		var allValidGranularities = _.filter(allTimeGranularities, function(granularity){return granularity==currentGranularity})	
		
		var returnValues =  []

		_.each(allValidGranularities, function(granularity){
			var new_query = Query.clone(query)
			Query.changeTimeGranularity(new_query, granularity)
			
			returnValues.push({target : new_query, source: RECOMMENDER_NAME, score: 1})
		})

		return returnValues
	}
}                    

suggestDifferentTimeGranularity.verboseName = "Change granularity"