import _ from "underscore";

import {Dashboards, Cards, FieldMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

 // useful extra data:
 //      most commonly viewed parameterized cards
 //           bonus points: when that parameter is filled out (vs just using the default)
 //           bonus points: when parameterized by that ID
 //      most commonly viewed parameterized dashboards


export function suggestDashboardParameterizedByID(query, resultRow, columnDefinitions){
	const RECOMMENDER_NAME = "Suggest Dashboards with ID Parameters"

	var linkFields = _.filter(columnDefinitions, function(column){FieldMetadata.isFKorPK(column)})

	var returnValues = []
	_.each(linkFields, function(link){

		var fieldID = linkFields.id

		var relevantDashboards = Dashboards.getDashboardsParameterizedBy(fieldID)

		_.each(relevantDashboards, function(dashboard){
			return returnValues.push({target : dashboard, source: RECOMMENDER_NAME, score: 1})
			
		})
	})
	return returnValues
}          
suggestDashboardParameterizedByID.verboseName =  "Suggest Dashboards with ID Parameters" 

export function suggestCardParameterizedByID(query, resultRow, columnDefinitions){
	const RECOMMENDER_NAME = "Suggest Cards with ID Parameters"

	var linkFields = _.filter(columnDefinitions, function(column){FieldMetadata.isFKorPK(column)})

	var returnValues = []
	_.each(linkFields, function(link){

		var fieldID = linkFields.id
		
		var relevantCards = Cards.getCardsParameterizedBy(fieldID)

		
		_.each(relevantCards, function(card){
			return returnValues.push({target : card, source: RECOMMENDER_NAME, score: 1})
			
		})
	})

	return returnValues
}                    
suggestCardParameterizedByID.verboseName =  "Suggest Cards with ID Parameters" 