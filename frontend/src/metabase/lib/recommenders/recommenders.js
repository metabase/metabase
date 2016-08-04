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
		console.log("Trying out recommender ", recommender)
		var recommendation = recommender.recommender(query)
		recommendation.recommenderWeight = recommender.base_weight
		return recommendation
	}))

	calculateScores(all_recommendations)
	return all_recommendations
}


export function allSuggestionsForRow(query, resultRow, columnDefinitions){
	var all_recommendations =  _.flatten(_.map(RowBasedRecommenders, function(recommender){
		var recommendation = recommender.recommender(query, resultRow, columnDefinitions)
		recommendation.recommenderWeight = recommender.base_weight
		return recommendation

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}

export function allSuggestionsForColumn(query, columnDefinitions, columnIndex){
	var all_recommendations =  _.flatten(_.map(columnBasedRecommenders, function(recommender){
		var recommendation = recommender.recommender(query, columnDefinitions, columnIndex)
		recommendation.recommenderWeight = recommender.base_weight
		return recommendation

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}


export function allSuggestionsForCell(query, resultRow, columnDefinitions, cellIndex){
	var all_recommendations =  _.flatten(_.map(cellBasedRecommenders, function(recommender){
		var recommendation = recommender.recommender(query, resultRow, columnDefinitions, cellIndex)
		recommendation.recommenderWeight = recommender.base_weight
		return recommendation

	}))

	calculateScores(all_recommendations)
	return all_recommendations
}

// Narrow down to the top next questions

const MAXIMUM_RECOMMENDATIONS = 12


function pickRecommendations(allRecommendations){
	var proposedRecommendations = []
	var recommendationsWithCDF = calculateCDF(allRecommendations)
	
	// Get all thre recommendations
	if(allRecommendations.length <= MAXIMUM_RECOMMENDATIONS){
		proposedRecommendations = allRecommendations
	} else{
		while(proposedRecommendations.length <= MAXIMUM_RECOMMENDATIONS){
			var randomNumber =Math.random();

			var index = findElement(recommendationsWithCDF, randomNumber);
			var result = recommendationsWithCDF[index]
			
			if(!_.contains(proposedRecommendations, result)){
				proposedRecommendations.push(result)
			}

		}

	}

	// Group them
	return _.groupBy(proposedRecommendations, function(recommendation){ return recommendation.source})
}

export function suggestionsForQuery(table, query){
    console.log("table", table)
	return pickRecommendations(allSuggestionsForQuery(query))
}

export function suggestionsForRow(query, resultRow, columnDefinitions){
	return pickRecommendations(allSuggestionsForRow(query, resultRow, columnDefinitions))
}

export function suggestionsForCell(query, resultRow, columnDefinitions, cellIndex){
	return pickRecommendations(allSuggestionsForCell(query, resultRow, columnDefinitions, cellIndex))
}

// TODO -- figure out format for the return values