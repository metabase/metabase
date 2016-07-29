import _ from "underscore";

import {Dashboards, Cards, FieldMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

 // useful extra data:
 //      most commonly viewed parameterized cards
 //           bonus points: when that parameter is filled out (vs just using the default)
 //           bonus points: when parameterized by that ID
 //      most commonly viewed parameterized dashboards


export function suggestDashboardParameterizedByID(query, resultRow, columnDefinitions, cellIndex){
	const RECOMMENDER_NAME = "Suggest Dashboards with ID Parameters"

	if(!FieldMetadata.isFKorPK(columnDefinitions[cellIndex])){
		return []
	} 

	var fieldID = columnDefinitions[cellIndex].id

	var relevantDashboards = Dashboards.getDashboardsParameterizedBy(fieldID)
	var returnValues = []

	_.each(relevantDashboards, function(dashboard){
		return returnValues.push({target : dashboard, source: RECOMMENDER_NAME, score: 1})
		
	})
	return returnValues
}          
suggestDashboardParameterizedByID.verboseName =  "Suggest Dashboards with ID Parameters" 

export function suggestCardParameterizedByID(query, resultRow, columnDefinitions, cellIndex){
	const RECOMMENDER_NAME = "Suggest Cards with ID Parameters"

	if(!FieldMetadata.isFKorPK(columnDefinitions[cellIndex])){
		return []
	} 

	var fieldID = columnDefinitions[cellIndex].id

	var relevantCards = Cards.getCardsParameterizedBy(fieldID)
	var returnValues = []
	
	_.each(relevantCards, function(card){
		return returnValues.push({target : card, source: RECOMMENDER_NAME, score: 1})
		
	})
	return returnValues
}                    
suggestCardParameterizedByID.verboseName =  "Suggest Cards with ID Parameters" 