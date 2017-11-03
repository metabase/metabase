// takes a distance float and uses it to return a human readable phrase
// indicating how similar two items in a comparison are

export const distanceToPhrase = (distance) => {
    if(distance >= 0.75) {
        return  'Very different'
    } else if (distance < 0.75 && distance >= 0.5) {
        return 'Somewhat different'
    } else if (distance < 0.5 && distance >= 0.25) {
        return 'Somewhat similar'
    } else {
        return 'Very similar'
    }
}

// Small utilities to determine whether we have an entity yet or not,
// used for loading status
function has (entity) {
    return typeof entity !== 'undefined' ? true : false
}

export const hasXray = has
export const hasComparison = has

export const xrayLoadingMessages = [
    'Generating your x-ray...',
    'Still working...',
]

export const comparisonLoadingMessages = [
    'Generating your comparison...',
    'Still working...',
]
