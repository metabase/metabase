
import { inflect } from "metabase/lib/formatting";

export class MinColumnsError {
    constructor(minColumns, actualColumns) {
        this.message = `Doh! The data from your query doesn't fit the chosen display choice. This visualization requires at least ${actualColumns} ${inflect("column", actualColumns)} of data.`;
    }
}

export class MinRowsError {
    constructor(minRows, actualRows) {
        this.message = `No dice. We have ${actualRows} data ${inflect("point", actualRows)} to show and that's not enough for this visualization.`;
        this.minRows = minRows;
        this.actualRows = actualRows;
    }
}

export class LatitudeLongitudeError {
    constructor(minRows, actualRows) {
        this.message = "Bummer. We can't actually do a pin map for this data because we require both a latitude and longitude column.";
    }
}

export class ChartSettingsError {
    constructor(message, section) {
        this.message = message || "Please configure this chart in the chart settings";
        this.section = section;
    }
}
