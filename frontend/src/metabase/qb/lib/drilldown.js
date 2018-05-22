/* @flow */

import { isa, TYPE } from "metabase/lib/types";
import {
  isLatitude,
  isLongitude,
  isDate,
  isAny,
} from "metabase/lib/schema_metadata";
import { getFieldRefFromColumn } from "./actions";

import _ from "underscore";
import { getIn } from "icepick";

// Helpers for defining drill-down progressions
const CategoryDrillDown = type => [field => isa(field.special_type, type)];
const DateTimeDrillDown = unit => [["datetime-field", isDate, unit]];

const LatLonDrillDown = (binningStrategy, binWidth) => [
  ["binning-strategy", isLatitude, binningStrategy, binWidth],
  ["binning-strategy", isLongitude, binningStrategy, binWidth],
];

/**
 * Defines the built-in drill-down progressions
 */
const DEFAULT_DRILL_DOWN_PROGRESSIONS = [
  // DateTime drill downs
  [
    DateTimeDrillDown("year"),
    DateTimeDrillDown("quarter"),
    DateTimeDrillDown("month"),
    DateTimeDrillDown("week"),
    DateTimeDrillDown("day"),
    DateTimeDrillDown("hour"),
    DateTimeDrillDown("minute"),
  ],
  // Country => State => City
  [
    CategoryDrillDown(TYPE.Country),
    CategoryDrillDown(TYPE.State),
    // CategoryDrillDown(TYPE.City)
  ],
  // Country, State, or City => LatLon
  [
    CategoryDrillDown(TYPE.Country), //
    LatLonDrillDown("bin-width", 10),
  ],
  [
    CategoryDrillDown(TYPE.State), //
    LatLonDrillDown("bin-width", 1),
  ],
  [
    CategoryDrillDown(TYPE.City), //
    LatLonDrillDown("bin-width", 0.1),
  ],
  // LatLon drill downs
  [
    LatLonDrillDown("bin-width", (binWidth: number) => binWidth >= 20), //
    LatLonDrillDown("bin-width", 10),
  ],
  [
    LatLonDrillDown("bin-width", () => true), //
    LatLonDrillDown("bin-width", (binWidth: number) => binWidth / 10),
  ],
  // generic num-bins drill down
  [
    [["binning-strategy", isAny, "num-bins", () => true]],
    [["binning-strategy", isAny, "default"]],
  ],
  // generic bin-width drill down
  [
    [["binning-strategy", isAny, "bin-width", () => true]],
    [
      [
        "binning-strategy",
        isAny,
        "bin-width",
        (binWidth: number) => binWidth / 10,
      ],
    ],
  ],
];

/**
 * Returns the next drill down for the current dimension objects
 */
export function drillDownForDimensions(dimensions: any, metadata: any) {
  const table = metadata && tableForDimensions(dimensions, metadata);

  for (const drillProgression of DEFAULT_DRILL_DOWN_PROGRESSIONS) {
    for (let index = 0; index < drillProgression.length - 1; index++) {
      const currentDrillBreakoutTemplates = drillProgression[index];
      const nextDrillBreakoutTemplates = drillProgression[index + 1];
      if (
        breakoutTemplatesMatchDimensions(
          currentDrillBreakoutTemplates,
          dimensions,
        )
      ) {
        const breakouts = breakoutsForBreakoutTemplates(
          nextDrillBreakoutTemplates,
          dimensions,
          table,
        );
        if (breakouts) {
          return {
            breakouts: breakouts,
          };
        }
      }
    }
  }
  return null;
}

// Returns true if the supplied dimension object matches the supplied breakout template.
function breakoutTemplateMatchesDimension(breakoutTemplate, dimension) {
  const breakout = columnToBreakout(dimension.column);
  if (Array.isArray(breakoutTemplate) !== Array.isArray(breakout)) {
    return false;
  }
  if (Array.isArray(breakoutTemplate)) {
    if (!breakoutTemplate[1](dimension.column)) {
      return false;
    }
    for (let i = 2; i < breakoutTemplate.length; i++) {
      if (typeof breakoutTemplate[i] === "function") {
        // $FlowFixMe
        if (!breakoutTemplate[i](breakout[i])) {
          return false;
        }
      } else {
        // $FlowFixMe
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

// Returns true if all breakout templates having a matching dimension object, but disregarding order
function breakoutTemplatesMatchDimensions(breakoutTemplates, dimensions) {
  dimensions = [...dimensions];
  return _.all(breakoutTemplates, breakoutTemplate => {
    const index = _.findIndex(dimensions, dimension =>
      breakoutTemplateMatchesDimension(breakoutTemplate, dimension),
    );
    if (index >= 0) {
      dimensions.splice(index, 1);
      return true;
    } else {
      return false;
    }
  });
}

// Evaluates a breakout template, returning a completed breakout clause
function breakoutForBreakoutTemplate(breakoutTemplate, dimensions, table) {
  let fieldFilter = Array.isArray(breakoutTemplate)
    ? breakoutTemplate[1]
    : breakoutTemplate;
  let dimensionColumns = dimensions.map(d => d.column);
  let field =
    _.find(dimensionColumns, fieldFilter) || _.find(table.fields, fieldFilter);
  if (!field) {
    return null;
  }
  const fieldRef = getFieldRefFromColumn(dimensions[0].column, field.id);
  if (Array.isArray(breakoutTemplate)) {
    const prevDimension = _.find(dimensions, dimension =>
      breakoutTemplateMatchesDimension(breakoutTemplate, dimension),
    );
    const breakout = [breakoutTemplate[0], fieldRef];
    for (let i = 2; i < breakoutTemplate.length; i++) {
      const arg = breakoutTemplate[i];
      if (typeof arg === "function") {
        if (!prevDimension) {
          return null;
        }
        const prevBreakout = columnToBreakout(prevDimension.column);
        // $FlowFixMe
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

// Evaluates all the breakout templates of a drill
function breakoutsForBreakoutTemplates(breakoutTemplates, dimensions, table) {
  const breakouts = [];
  for (const breakoutTemplate of breakoutTemplates) {
    const breakout = breakoutForBreakoutTemplate(
      breakoutTemplate,
      dimensions,
      table,
    );
    if (!breakout) {
      return null;
    }
    breakouts.push(breakout);
  }
  return breakouts;
}

// Guesses the breakout corresponding to the provided columm object
function columnToBreakout(column) {
  if (column.unit) {
    return ["datetime-field", column.id, column.unit];
  } else if (column.binning_info) {
    let binningStrategy = column.binning_info.binning_strategy;

    switch (binningStrategy) {
      case "bin-width":
        return [
          "binning-strategy",
          column.id,
          "bin-width",
          column.binning_info.bin_width,
        ];
      case "num-bins":
        return [
          "binning-strategy",
          column.id,
          "num-bins",
          column.binning_info.num_bins,
        ];
      default:
        return null;
    }
  } else {
    return column.id;
  }
}

// returns the table metadata for a dimension
function tableForDimensions(dimensions, metadata) {
  const fieldId = getIn(dimensions, [0, "column", "id"]);
  const field = metadata.fields[fieldId];
  return field && field.table;
}
