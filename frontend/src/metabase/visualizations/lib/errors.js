/* @flow */

import { inflect } from "metabase/lib/formatting";

// NOTE: extending Error with Babel requires babel-plugin-transform-builtin-extend

export class MinColumnsError extends Error {
    constructor(minColumns: number, actualColumns: number) {
        super(`Doh! The data from your query doesn't fit the chosen display choice. This visualization requires at least ${actualColumns} ${inflect("column", actualColumns)} of data.`);
    }
}

export class MinRowsError extends Error {
    constructor(minRows: number, actualRows: number) {
        super(`No dice. We have ${actualRows} data ${inflect("point", actualRows)} to show and that's not enough for this visualization.`);
    }
}

export class LatitudeLongitudeError extends Error {
    constructor() {
        super("Bummer. We can't actually do a pin map for this data because we require both a latitude and longitude column.");
    }
}

export class ChartSettingsError extends Error {
    section: ?string;
    buttonText: ?string;
    constructor(message: string, section?: string, buttonText?: string) {
        super(message || "Please configure this chart in the chart settings");
        this.section = section;
        this.buttonText = buttonText || "Edit Settings";
    }
}
