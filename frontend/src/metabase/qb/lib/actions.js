/* @flow weak */

import moment from "moment";
import _ from "underscore";

import Q from "metabase/lib/query"; // legacy query lib
import { fieldIdsEq } from "metabase/lib/query/util";
import * as Card from "metabase/meta/Card";
import * as Query from "metabase/lib/query/query";
import * as Field from "metabase/lib/query/field";
import * as Filter from "metabase/lib/query/filter";
import { startNewCard } from "metabase/lib/card";
import { rangeForValue } from "metabase/lib/dataset";
import {
  isDate,
  isState,
  isCountry,
  isCoordinate,
} from "metabase/lib/schema_metadata";
import Utils from "metabase/lib/utils";

import type Table from "metabase-lib/lib/metadata/Table";
import type { Card as CardObject } from "metabase/meta/types/Card";
import type { FieldId } from "metabase/meta/types/Field";
import type {
  StructuredQuery,
  FieldFilter,
  Breakout,
  LocalFieldReference,
  ForeignFieldReference,
  FieldLiteral,
} from "metabase/meta/types/Query";
import type { Column } from "metabase/meta/types/Dataset";
import type { DimensionValue } from "metabase/meta/types/Visualization";
import { parseTimestamp } from "metabase/lib/time";

// TODO: use icepick instead of mutation, make they handle frozen cards

export const toUnderlyingData = (card: CardObject): ?CardObject => {
  const newCard = startNewCard("query");
  newCard.dataset_query = Utils.copy(card.dataset_query);
  newCard.display = "table";
  newCard.original_card_id = card.id;
  return newCard;
};

export const toUnderlyingRecords = (card: CardObject): ?CardObject => {
  if (card.dataset_query.type === "query") {
    const query: StructuredQuery = Utils.copy(card.dataset_query).query;
    const newCard = startNewCard(
      "query",
      card.dataset_query.database,
      query.source_table,
    );
    newCard.dataset_query.query.filter = query.filter;
    return newCard;
  }
};

export const getFieldRefFromColumn = (
  column: Column,
  fieldId?: ?(FieldId | FieldLiteral) = column.id,
): LocalFieldReference | ForeignFieldReference | FieldLiteral => {
  if (fieldId == null) {
    throw new Error(
      "getFieldRefFromColumn expects non-null fieldId or column with non-null id",
    );
  }
  if (Array.isArray(fieldId)) {
    // NOTE: sometimes col.id is a field reference (e.x. nested queries), if so just return it
    return fieldId;
  } else if (column.fk_field_id != null) {
    return ["fk->", column.fk_field_id, fieldId];
  } else {
    return ["field-id", fieldId];
  }
};

const clone = card => {
  const newCard = startNewCard("query");

  newCard.display = card.display;
  newCard.dataset_query = Utils.copy(card.dataset_query);

  // The Question lib doesn't always set a viz setting. Placing a check here, but we should probably refactor this
  // into a separate test + clean up the question lib.
  if (card.visualization_settings) {
    newCard.visualization_settings = Utils.copy(card.visualization_settings);
  }

  return newCard;
};

// Adds a new filter with the specified operator, column, and value
export const filter = (card, operator, column, value) => {
  const newCard = clone(card);

  // $FlowFixMe:
  const filter: FieldFilter = [operator, getFieldRefFromColumn(column), value];
  newCard.dataset_query.query = Query.addFilter(
    newCard.dataset_query.query,
    filter,
  );
  return newCard;
};

const drillFilter = (card, value, column) => {
  let filter;
  if (isDate(column)) {
    filter = [
      "=",
      ["datetime-field", getFieldRefFromColumn(column), "as", column.unit],
      parseTimestamp(value, column.unit).toISOString(),
    ];
  } else {
    const range = rangeForValue(value, column);
    if (range) {
      filter = ["BETWEEN", getFieldRefFromColumn(column), range[0], range[1]];
    } else {
      filter = ["=", getFieldRefFromColumn(column), value];
    }
  }

  return addOrUpdateFilter(card, filter);
};

export const addOrUpdateFilter = (card, filter) => {
  let newCard = clone(card);
  // replace existing filter, if it exists
  let filters = Query.getFilters(newCard.dataset_query.query);
  for (let index = 0; index < filters.length; index++) {
    if (
      Filter.isFieldFilter(filters[index]) &&
      Field.getFieldTargetId(filters[index][1]) ===
        Field.getFieldTargetId(filter[1])
    ) {
      newCard.dataset_query.query = Query.updateFilter(
        newCard.dataset_query.query,
        index,
        filter,
      );
      return newCard;
    }
  }

  // otherwise add a new filter
  newCard.dataset_query.query = Query.addFilter(
    newCard.dataset_query.query,
    filter,
  );
  return newCard;
};

export const addOrUpdateBreakout = (card, breakout) => {
  let newCard = clone(card);
  // replace existing breakout, if it exists
  let breakouts = Query.getBreakouts(newCard.dataset_query.query);
  for (let index = 0; index < breakouts.length; index++) {
    if (
      fieldIdsEq(
        Field.getFieldTargetId(breakouts[index]),
        Field.getFieldTargetId(breakout),
      )
    ) {
      newCard.dataset_query.query = Query.updateBreakout(
        newCard.dataset_query.query,
        index,
        breakout,
      );
      return newCard;
    }
  }

  // otherwise add a new breakout
  newCard.dataset_query.query = Query.addBreakout(
    newCard.dataset_query.query,
    breakout,
  );
  return newCard;
};

const UNITS = ["minute", "hour", "day", "week", "month", "quarter", "year"];
const getNextUnit = unit => {
  return UNITS[Math.max(0, UNITS.indexOf(unit) - 1)];
};

export { drillDownForDimensions } from "./drilldown";

export const drillUnderlyingRecords = (card, dimensions) => {
  for (const dimension of dimensions) {
    card = drillFilter(card, dimension.value, dimension.column);
  }
  return toUnderlyingRecords(card);
};

export const drillRecord = (databaseId, tableId, fieldId, value) => {
  const newCard = startNewCard("query", databaseId, tableId);
  newCard.dataset_query.query = Query.addFilter(newCard.dataset_query.query, [
    "=",
    ["field-id", fieldId],
    value,
  ]);
  return newCard;
};

export const plotSegmentField = card => {
  const newCard = startNewCard("query");
  newCard.display = "scatter";
  newCard.dataset_query = Utils.copy(card.dataset_query);
  return newCard;
};

export const summarize = (card, aggregation, tableMetadata) => {
  const newCard = startNewCard("query");
  newCard.dataset_query = Utils.copy(card.dataset_query);
  newCard.dataset_query.query = Query.addAggregation(
    newCard.dataset_query.query,
    aggregation,
  );
  guessVisualization(newCard, tableMetadata);
  return newCard;
};

export const breakout = (card, breakout, tableMetadata) => {
  const newCard = startNewCard("query");
  newCard.dataset_query = Utils.copy(card.dataset_query);
  newCard.dataset_query.query = Query.addBreakout(
    newCard.dataset_query.query,
    breakout,
  );
  guessVisualization(newCard, tableMetadata);
  return newCard;
};

// min number of points when switching units
const MIN_INTERVALS = 4;

export const updateDateTimeFilter = (card, column, start, end): CardObject => {
  let newCard = clone(card);

  let fieldRef = getFieldRefFromColumn(column);
  start = moment(start);
  end = moment(end);
  if (column.unit) {
    // start with the existing breakout unit
    let unit = column.unit;

    // clamp range to unit to ensure we select exactly what's represented by the dots/bars
    start = start.add(1, unit).startOf(unit);
    end = end.endOf(unit);

    // find the largest unit with at least MIN_INTERVALS
    while (
      unit !== getNextUnit(unit) &&
      end.diff(start, unit) < MIN_INTERVALS
    ) {
      unit = getNextUnit(unit);
    }

    // update the breakout
    newCard = addOrUpdateBreakout(newCard, [
      "datetime-field",
      fieldRef,
      "as",
      unit,
    ]);

    // round to start of the original unit
    start = start.startOf(column.unit);
    end = end.startOf(column.unit);

    if (start.isAfter(end)) {
      return card;
    }
    if (start.isSame(end, column.unit)) {
      // is the start and end are the same (in whatever the original unit was) then just do an "="
      return addOrUpdateFilter(newCard, [
        "=",
        ["datetime-field", fieldRef, "as", column.unit],
        start.format(),
      ]);
    } else {
      // otherwise do a BETWEEN
      return addOrUpdateFilter(newCard, [
        "BETWEEN",
        ["datetime-field", fieldRef, "as", column.unit],
        start.format(),
        end.format(),
      ]);
    }
  } else {
    return addOrUpdateFilter(newCard, [
      "BETWEEN",
      fieldRef,
      start.format(),
      end.format(),
    ]);
  }
};

export function updateLatLonFilter(
  card,
  latitudeColumn,
  longitudeColumn,
  bounds,
) {
  return addOrUpdateFilter(card, [
    "INSIDE",
    latitudeColumn.id,
    longitudeColumn.id,
    bounds.getNorth(),
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
  ]);
}

export function updateNumericFilter(card, column, start, end) {
  const fieldRef = getFieldRefFromColumn(column);
  return addOrUpdateFilter(card, ["BETWEEN", fieldRef, start, end]);
}

export const pivot = (
  card: CardObject,
  tableMetadata: Table,
  breakouts: Breakout[] = [],
  dimensions: DimensionValue[] = [],
): ?CardObject => {
  if (card.dataset_query.type !== "query") {
    return null;
  }

  let newCard = startNewCard("query");
  newCard.dataset_query = Utils.copy(card.dataset_query);

  for (const dimension of dimensions) {
    newCard = drillFilter(newCard, dimension.value, dimension.column);
    const breakoutFields = Query.getBreakoutFields(
      newCard.dataset_query.query,
      tableMetadata,
    );
    for (const [index, field] of breakoutFields.entries()) {
      if (field && fieldIdsEq(field.id, dimension.column.id)) {
        newCard.dataset_query.query = Query.removeBreakout(
          newCard.dataset_query.query,
          index,
        );
      }
    }
  }

  for (const breakout of breakouts) {
    newCard.dataset_query.query = Query.addBreakout(
      newCard.dataset_query.query,
      breakout,
    );
  }

  guessVisualization(newCard, tableMetadata);

  return newCard;
};

// const VISUALIZATIONS_ONE_BREAKOUTS = new Set([
//     "bar",
//     "line",
//     "area",
//     "row",
//     "pie",
//     "map"
// ]);
const VISUALIZATIONS_TWO_BREAKOUTS = new Set(["bar", "line", "area"]);

const guessVisualization = (card: CardObject, tableMetadata: Table) => {
  const query = Card.getQuery(card);
  if (!query) {
    return;
  }
  const aggregations = Query.getAggregations(query);
  const breakoutFields = Query.getBreakouts(query).map(
    breakout => (Q.getFieldTarget(breakout, tableMetadata) || {}).field,
  );
  if (aggregations.length === 0 && breakoutFields.length === 0) {
    card.display = "table";
  } else if (aggregations.length === 1 && breakoutFields.length === 0) {
    card.display = "scalar";
  } else if (aggregations.length === 1 && breakoutFields.length === 1) {
    if (isState(breakoutFields[0])) {
      card.display = "map";
      card.visualization_settings["map.type"] = "region";
      card.visualization_settings["map.region"] = "us_states";
    } else if (isCountry(breakoutFields[0])) {
      card.display = "map";
      card.visualization_settings["map.type"] = "region";
      card.visualization_settings["map.region"] = "world_countries";
    } else if (isDate(breakoutFields[0])) {
      card.display = "line";
    } else {
      card.display = "bar";
    }
  } else if (aggregations.length === 1 && breakoutFields.length === 2) {
    if (!VISUALIZATIONS_TWO_BREAKOUTS.has(card.display)) {
      if (isDate(breakoutFields[0])) {
        card.display = "line";
      } else if (_.all(breakoutFields, isCoordinate)) {
        card.display = "map";
        card.visualization_settings["map.type"] = "grid";
      } else {
        card.display = "bar";
      }
    }
  } else {
    console.warn("Couldn't guess visualization", card);
    card.display = "table";
  }
};
