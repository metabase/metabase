/* @flow */

import { isa, TYPE } from "metabase/lib/types";
import {
    isLatitude,
    isLongitude,
    isDate,
    isAny
} from "metabase/lib/schema_metadata";

import _ from "underscore";
import { getIn } from "icepick";

const CategoryDrillDown = type => [field => isa(field.special_type, type)];

const DateTimeDrillDown = unit => [["datetime-field", isDate, unit]];

const LatLonDrillDown = binWidth => [
    ["binning-strategy", isLatitude, "bin-width", binWidth],
    ["binning-strategy", isLongitude, "bin-width", binWidth]
];

const DEFAULT_DRILL_DOWNS = [
    // DateTime drill downs
    [
        DateTimeDrillDown("year"),
        DateTimeDrillDown("quarter"),
        DateTimeDrillDown("month"),
        DateTimeDrillDown("week"),
        DateTimeDrillDown("day"),
        DateTimeDrillDown("hour"),
        DateTimeDrillDown("minute")
    ],
    // Country => State => City
    [
        CategoryDrillDown(TYPE.Country),
        CategoryDrillDown(TYPE.State),
        CategoryDrillDown(TYPE.City)
    ],
    // Country => LatLon
    [CategoryDrillDown(TYPE.Country), LatLonDrillDown(10)],
    // State => LatLon
    [CategoryDrillDown(TYPE.State), LatLonDrillDown(1)],
    [CategoryDrillDown(TYPE.City), LatLonDrillDown(0.1)],
    // LatLon drill downs
    [
        [
            ["binning-strategy", isLatitude, "num-bins", () => true],
            ["binning-strategy", isLongitude, "num-bins", () => true]
        ],
        LatLonDrillDown(1)
    ],
    [
        LatLonDrillDown(30),
        LatLonDrillDown(10),
        LatLonDrillDown(1),
        LatLonDrillDown(0.1),
        LatLonDrillDown(0.01)
    ],
    // generic num-bins drill down
    [
        [["binning-strategy", isAny, "num-bins", () => true]],
        [["binning-strategy", isAny, "num-bins", previous => previous]]
    ],
    // generic bin-width drill down
    [
        [["binning-strategy", isAny, "bin-width", () => true]],
        [["binning-strategy", isAny, "bin-width", previous => previous / 10]]
    ]
];

function breakoutTemplateMatchesDimension(breakoutTemplate, dimension) {
    const breakout = HACK_columnToBreakout(dimension.column);
    if (Array.isArray(breakoutTemplate) !== Array.isArray(breakout)) {
        return false;
    }
    if (Array.isArray(breakoutTemplate)) {
        if (!breakoutTemplate[1](dimension.column)) {
            return false;
        }
        for (let i = 2; i < breakoutTemplate.length; i++) {
            if (typeof breakoutTemplate[i] === "function") {
                if (!breakoutTemplate[i](breakout[i])) {
                    return false;
                }
            } else {
                if (breakoutTemplate[i] !== breakout[i]) {
                    return false;
                }
            }
        }
        return true;
    } else {
        return breakoutTemplate(dimension.column);
    }
}

function drillMatchesDimensions(drill, dimensions) {
    dimensions = [...dimensions];
    return _.all(drill, breakoutTemplate => {
        const index = _.findIndex(dimensions, dimension =>
            breakoutTemplateMatchesDimension(breakoutTemplate, dimension));
        if (index >= 0) {
            dimensions.splice(index, 1);
            return true;
        } else {
            return false;
        }
    });
}

import { getFieldRefFromColumn } from "./actions";

function breakoutForBreakoutTemplate(breakoutTemplate, dimensions, table) {
    let fieldFilter = Array.isArray(breakoutTemplate)
        ? breakoutTemplate[1]
        : breakoutTemplate;
    let field = _.find(table.fields, fieldFilter);
    if (!field) {
        return null;
    }
    const fieldRef = getFieldRefFromColumn(dimensions[0].column, field.id);
    if (Array.isArray(breakoutTemplate)) {
        const prevDimension = _.find(dimensions, dimension =>
            breakoutTemplateMatchesDimension(breakoutTemplate, dimension));
        const breakout = [breakoutTemplate[0], fieldRef];
        for (let i = 2; i < breakoutTemplate.length; i++) {
            const arg = breakoutTemplate[i];
            if (typeof arg === "function") {
                if (!prevDimension) {
                    return null;
                }
                const prevBreakout = HACK_columnToBreakout(
                    prevDimension.column
                );
                breakout.push(arg(prevBreakout[i]));
            } else {
                breakout.push(arg);
            }
        }
        return breakout;
    } else {
        return fieldRef;
    }
}

function breakoutsForDrill(drill, dimensions, table) {
    const breakouts = [];
    for (const breakoutTemplate of drill) {
        const breakout = breakoutForBreakoutTemplate(
            breakoutTemplate,
            dimensions,
            table
        );
        if (!breakout) {
            return null;
        }
        breakouts.push(breakout);
    }
    return breakouts;
}

export function drillDownForDimensions(dimensions, metadata) {
    const table = metadata && tableForDimensions(dimensions, metadata);

    for (const drillSeries of DEFAULT_DRILL_DOWNS) {
        for (let index = 0; index < drillSeries.length - 1; index++) {
            const currentDrill = drillSeries[index];
            const nextDrill = drillSeries[index + 1];
            if (drillMatchesDimensions(currentDrill, dimensions)) {
                const breakouts = breakoutsForDrill(
                    nextDrill,
                    dimensions,
                    table
                );
                if (breakouts) {
                    return {
                        breakouts: breakouts
                    };
                }
            }
        }
    }
}

function HACK_columnToBreakout(column) {
    if (column.unit) {
        return ["datetime-field", column.id, column.unit];
    } else if (column.binning_info) {
        let binningStrategy = column.binning_info.binning_strategy;

        // HACK: `binning_strategy` currently always returns `num-bins`, so try to guess if it's actually `bin-width`
        if (binningStrategy === "num-bins") {
            const numBinsComputed = (column.binning_info.max_value -
                column.binning_info.min_value) /
                column.binning_info.bin_width;
            const numBinsError = Math.abs(
                column.binning_info.num_bins - numBinsComputed
            ) / numBinsComputed;
            if (numBinsError > 0.0000001) {
                binningStrategy = "bin-width";
            }
        }

        switch (binningStrategy) {
            case "bin-width":
                return [
                    "binning-strategy",
                    column.id,
                    "bin-width",
                    column.binning_info.bin_width
                ];
            case "num-bins":
                return [
                    "binning-strategy",
                    column.id,
                    "num-bins",
                    column.binning_info.num_bins
                ];
            default:
                return null;
        }
    } else {
        return column.id;
    }
}

function tableForDimensions(dimensions, metadata) {
    const fieldId = getIn(dimensions, [0, "column", "id"]);
    const field = metadata.fields[fieldId];
    return field && field.table;
}
