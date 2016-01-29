
export class MinColumnsError {
    constructor(minColumns, actualColumns) {
        this.message = "Doh! The data from your query doesn't fit the chosen display choice. This visualization requires at least " + minColumns + " columns of data.";
    }
}

export class MinRowsError {
    constructor(minRows, actualRows) {
        this.message = "No dice. We only have 1 data point to show and that's not enough for this visualization.";
    }
}

export class LatitudeLongitudeError {
    constructor(minRows, actualRows) {
        this.message = "Bummer. We can't actually do a pin map for this data because we require both a latitude and longitude column.";
    }
}
