import _ from "underscore";

import {
    findElement,
    calculateCDF
} from 'metabase/lib/recommendations';

import { TableBasedRecommenders } from "metabase/lib/recommenders/table_based/all.js";
import { RowBasedRecommenders } from "metabase/lib/recommenders/row_based/all.js";
import { cellBasedRecommenders } from "metabase/lib/recommenders/cell_based/all.js";
import { columnBasedRecommenders } from "metabase/lib/recommenders/column_based/all.js";

// Helper functions

function calculateScores(recommendations){
	// a recommendation's score is it's recommenders weight times the recommender's score 
	// for the suggestion
	// It's expected this will be the place where per-user blacklists, 
	// instance weight modifications, etc will be woven in
	_.each(recommendations, function(recommendation){
		recommendation.weight = recommendation.recommenderWeight * recommendation.score
	})
}

// Getting all suggestions from each recommender

export function allSuggestionsForQuery(query){
	var all_recommendations =  _.flatten(_.map(TableBasedRecommenders, function(recommender){
		var recommendations = recommender.recommender(query)
		_.each(recommendations, function(recommendation){
			recommendation.recommenderWeight = recommender.base_weight
		})
		return recommendations
	}))

	calculateScores(all_recommendations)
	return all_recommendations
}


export function allSuggestionsForRow(query, resultRow, columnDefinitions){
	var all_recommendations =  _.flatten(_.map(RowBasedRecommenders, function(recommender){
		var recommendations = recommender.recommender(query, resultRow, columnDefinitions)
		_.each(recommendations, function(recommendation){
			recommendation.recommenderWeight = recommender.base_weight
		})
		return recommendations

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}

export function allSuggestionsForColumn(query, columnDefinitions, columnIndex){
	var all_recommendations =  _.flatten(_.map(columnBasedRecommenders, function(recommender){
		var recommendations = recommender.recommender(query, columnDefinitions, columnIndex)
		_.each(recommendations, function(recommendation){
			recommendation.recommenderWeight = recommender.base_weight
		})
		return recommendations

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}


export function allSuggestionsForCell(query, resultRow, columnDefinitions, cellIndex){
	var all_recommendations =  _.flatten(_.map(cellBasedRecommenders, function(recommender){
		var recommendations = recommender.recommender(query, resultRow, columnDefinitions, cellIndex)
		_.each(recommendations, function(recommendation){
			recommendation.recommenderWeight = recommender.base_weight
		})
		return recommendations

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}

// Narrow down to the top next questions

const MAXIMUM_RECOMMENDATIONS = 12


function pickRecommendations(allRecommendations){
	var proposedRecommendations = []
	var recommendationsCDF = calculateCDF(allRecommendations)

	// Get all thre recommendations
	if(allRecommendations.length <= MAXIMUM_RECOMMENDATIONS){
		proposedRecommendations = allRecommendations
	} else{
		while(proposedRecommendations.length <= MAXIMUM_RECOMMENDATIONS){
			var randomNumber =Math.random();

			var index = findElement(recommendationsCDF, randomNumber);
			var result = allRecommendations[index]
			
			if(!_.contains(proposedRecommendations, result)){
				proposedRecommendations.push(result)
			}

		}

	}

	// Group them
	return _.groupBy(proposedRecommendations, function(recommendation){ return recommendation.source})
}

export function suggestionsForQuery(query){
	return pickRecommendations(allSuggestionsForQuery(query))
}

export function suggestionsForRow(query, resultRow, columnDefinitions){
	return pickRecommendations(allSuggestionsForRow(query, resultRow, columnDefinitions))
}

export function suggestionsForCell(query, resultRow, columnDefinitions, cellIndex){
	return pickRecommendations(allSuggestionsForCell(query, resultRow, columnDefinitions, cellIndex))
}

// TODO -- figure out format for the return values