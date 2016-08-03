import _ from "underscore";

import {Dashboards, Cards, FieldMetadata} from "metabase/lib/recommenders/thingsThatWouldBeUseful"

 // useful extra data:
 //      most commonly viewed parameterized cards
 //           bonus points: when that parameter is filled out (vs just using the default)
 //           bonus points: when parameterized by that ID
 //      most commonly viewed parameterized dashboards


export function suggestDashboardParameterizedByID(query, resultRow, columnDefinitions){
	const RECOMMENDER_NAME = "Suggest Dashboards with ID Parameters"

	var linkFields = _.filter(_.zip(columnDefinitions, resultRow), function(columnPair){
		return FieldMetadata.isFKorPK(columnPair[0])
	})

	var returnValues = []
	
	_.each(linkFields, function(linkedFieldPairs){
		var link = linkedFieldPairs[0]
		var linkValue = linkedFieldPairs[1]

		var relevantDashboards = Dashboards.getDashboardsParameterizedBy(link)

		_.each(relevantDashboards, function(dashboard){
			return returnValues.push({source: RECOMMENDER_NAME, 
									  recommendation: "See Dashboard " + dashboard.name + " limited by " + link.name, 
									  url: "/dashboard/" + dashboard.id, 
									  score: 1})
			
		})
	})
	return returnValues
}          
suggestDashboardParameterizedByID.verboseName =  "Suggest Dashboards with ID Parameters" 

export function suggestCardParameterizedByID(query, resultRow, columnDefinitions){
	const RECOMMENDER_NAME = "Suggest Cards with ID Parameters"

	var linkFields = _.filter(columnDefinitions, function(column){return FieldMetadata.isFKorPK(column)})

	var returnValues = []
	_.each(linkFields, function(link){

		var fieldID = link.id
		
		var relevantCards = Cards.getCardsParameterizedBy(link)

		
		_.each(relevantCards, function(card){
			return returnValues.push({source: RECOMMENDER_NAME, 
									  recommendation: "See Card " + card.name + " limited by " + link.name,  
									  url: "/card/" + card.id, 
									  score: 1})
			
		})
	})

	return returnValues
}                    
suggestCardParameterizedByID.verboseName =  "Suggest Cards with ID Parameters" 