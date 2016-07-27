import _ from "underscore";

import * as Query from "metabase/meta/Query";
import {Dashboards, Cards, FieldMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

export function suggestObjectDetailView(query, resultRow, columnDefinitions, cellIndex){
	const RECOMMENDER_NAME = "Suggested Object Detail View"

	if(FieldMetadata.isFKorPK(columnDefinitions[cellIndex])){
		new_query = Query.objectDetailFor(columnDefinitions[cellIndex], resultRow[cellIndex])
		return [{target : new_query, source: RECOMMENDER_NAME, score: 1}]
	} 

	return []
}                    

suggestObjectDetailView.verboseName = "Suggested Object Detail View"


