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
