import _ from "underscore";

export function findElement(arrayCDF, probability) {
	// given a probability between `probability` (0, 1), find the index i where 
	// arrayCDF.cummulativeProbability[i-1] < probability <= arrayCDF.cummulativeProbability[i]

	// if we have a single element, don't bother
	if(arrayCDF.length == 1) {
		return 0
	}
 	
 	// Check that we have a valid CDF
 	if (arrayCDF[0] <= 0 || arrayCDF[0] > 1 || arrayCDF[arrayCDF.length - 1] != 1) {
		// invalid CDF
		console.log("Invalid CDF", arrayCDF)
		throw "Invalid CDF"
	}

	// Check that we have a valid probability
	if (probability < 0 || probability > 1) {
		// invalid probability
		throw "Invalid probability"
	}

	// Move forward until we get to a CDF value that includes the probability
	for (let i = 0; i < arrayCDF.length - 1 ; i++) {
		if (arrayCDF[i] >= probability) {
			return i
		}
	}
 
    return arrayCDF.length - 1;
}

export function calculateCDF(arrayWithWeights) {
	// This calculates the cummulative distribution function of an arrayWithWeights.
	// Expects an array of dictionaries with a "weight" attribute
	// This modifies the arrayCDF
	var totalWeights = _.reduce(arrayWithWeights, function(memo, weightedElement){
		return memo + weightedElement.weight;
	}, 0)
	var currentTotalWeight = 0.0
	var returnValue = []

	for (let weightedElement of arrayWithWeights) {
		currentTotalWeight = currentTotalWeight + weightedElement.weight
		returnValue.push(currentTotalWeight / totalWeights)
	}
	return returnValue;
}


export function weightedSelect(arrayWithWeights) {
	var arrayWithCDF = calculateCDF(arrayWithWeights);
	var randomNumber =Math.random();

	var index = findElement(arrayWithCDF, randomNumber);

	return arrayWithCDF[index]
}
