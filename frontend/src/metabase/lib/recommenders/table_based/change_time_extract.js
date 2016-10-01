import _ from "underscore";

import Query from "metabase/lib/Query";

     // useful extra data:
     //      Most common time extract for the dimension in question


export function suggestDifferentTimeExtract(query){
	const RECOMMENDER_NAME = "Change Time Extract"
	var returnValues =  []
	if(Query.isBrokenOutByTime(query)){
		var allTimeExtracts = Query.getAllTimeExtracts()
		var currentExtract = Query.getTimeExtract(query)
		var allValidExtracts = _.filter(allTimeExtracts, function(extract){return extract != currentExtract})	
		
		_.each(allValidExtracts, function(extract){
			var new_query = Query.clone(query)
			Query.changeTimeExtract(new_query, extract)
			
			returnValues.push({target : new_query, 
							   source: RECOMMENDER_NAME, 
							   recommendation: "See by " + extract + " instead" ,  
							   url: Query.toURL(new_query), 
							   score: 1})
		})
	}
	return returnValues
}                    

suggestDifferentTimeExtract.verboseName = "Change Time Extract"