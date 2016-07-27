import _ from "underscore";

import * as Query from "metabase/meta/Query";
import {FieldMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

export function suggestObjectDetailView(query, resultRow, columnDefinitions){
	const RECOMMENDER_NAME = "Suggested Object Detail View"

	linkFields = _.filter(_.zip(columnDefinitions, resultRow), function(columnPair){
		FieldMetadata.isFKorPK(columnPair[0])
	})
	
	var returnValues = []
	
	_.each(linkFields, function(columnnPair){
		new_query = Query.objectDetailFor(columnPair[0], columnPair[1])
		returnValues.push({target : new_query, source: RECOMMENDER_NAME, score: 1})

	})

	return returnValues
}          
suggestObjectDetailView.verboseName = "Suggested Object Detail View"

