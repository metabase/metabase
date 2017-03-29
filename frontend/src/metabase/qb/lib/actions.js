/* @flow weak */

import moment from "moment";

import Q from "metabase/lib/query"; // legacy query lib
import * as Query from "metabase/lib/query/query";
import * as Field from "metabase/lib/query/field";
import * as Filter from "metabase/lib/query/filter";
import { startNewCard } from "metabase/lib/card";
import { isDate, isState, isCountry } from "metabase/lib/schema_metadata";

import type { Card } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";

export const toUnderlyingData = (card: Card): Card => {
    const newCard = startNewCard("query");
    newCard.dataset_query = card.dataset_query;
    newCard.display = "table";
    return newCard;
};

export const toUnderlyingRecords = (card: Card): Card => {
    const newCard = startNewCard(
        "query",
        card.dataset_query.database,
        card.dataset_query.query.source_table
    );
    newCard.dataset_query.query.filter = card.dataset_query.query.filter;
    return newCard;
};

const getFieldClauseFromCol = col => {
    if (col.fk_field_id != null) {
        return ["fk->", col.fk_field_id, col.id];
    } else {
        return ["field-id", col.id];
    }
};

const clone = card => {
    const newCard = startNewCard("query");

    newCard.display = card.display;
    newCard.dataset_query = card.dataset_query;
    newCard.visualization_settings = card.visualization_settings;

    return newCard;
};

// Adds a new filter with the specified operator, column, and value
export const filter = (card, operator, column, value) => {
    let newCard = clone(card);
    newCard.dataset_query.query = Query.addFilter(newCard.dataset_query.query, [
        operator,
        getFieldClauseFromCol(column),
        value
    ]);
    return newCard;
};

const drillFilter = (card, value, column) => {
    let newCard = clone(card);

    let filter;
    if (isDate(column)) {
        filter = [
            "=",
            [
                "datetime-field",
                getFieldClauseFromCol(column),
                "as",
                column.unit
            ],
            moment(value).toISOString()
        ];
    } else {
        filter = ["=", getFieldClauseFromCol(column), value];
    }

    // replace existing filter, if it exists
    let filters = Query.getFilters(newCard.dataset_query.query);
    for (let index = 0; index < filters.length; index++) {
        if (
            Filter.isFieldFilter(filters[index]) &&
            Field.getFieldTargetId(filters[index][1]) === column.id
        ) {
            newCard.dataset_query.query = Query.updateFilter(
                newCard.dataset_query.query,
                index,
                filter
            );
            return newCard;
        }
    }

    // otherwise add a new filter
    newCard.dataset_query.query = Query.addFilter(
        newCard.dataset_query.query,
        filter
    );
    return newCard;
};

const UNITS = ["minute", "hour", "day", "week", "month", "quarter", "year"];

export const drillTimeseriesFilter = (card, value, column) => {
    const newCard = drillFilter(card, value, column);

    let nextUnit = UNITS[Math.max(0, UNITS.indexOf(column.unit) - 1)];

    newCard.dataset_query.query.breakout[0] = [
        "datetime-field",
        card.dataset_query.query.breakout[0][1],
        "as",
        nextUnit
    ];

    return newCard;
};

export const drillUnderlyingRecords = (card, value, column) => {
    return toUnderlyingRecords(drillFilter(card, value, column));
};

export const drillRecord = (databaseId, tableId, fieldId, value) => {
    const newCard = startNewCard("query", databaseId, tableId);
    newCard.dataset_query.query = Query.addFilter(newCard.dataset_query.query, [
        "=",
        fieldId,
        value
    ]);
    return newCard;
};

export const plotSegmentField = card => {
    const newCard = startNewCard("query");
    newCard.display = "scatter";
    newCard.dataset_query = card.dataset_query;
    return newCard;
};

export const summarize = (card, aggregation, tableMetadata) => {
    const newCard = startNewCard("query");
    newCard.dataset_query = card.dataset_query;
    newCard.dataset_query.query = Query.addAggregation(
        newCard.dataset_query.query,
        aggregation
    );
    guessVisualization(newCard, tableMetadata);
    return newCard;
};

import { Value, Column } from "metabase/meta/types/Dataset";

type DrillClick = {
    value: Value,
    column: Column,
    metricValue?: Value,
    metricColumn?: Column,
    event?: MouseEvent,
    element?: HTMLElement
};

export const pivot = (
    card: Card,
    breakout,
    tableMetadata: TableMetadata,
    clicked: ?DrillClick
): Card => {
    let newCard;

    if (clicked) {
        newCard = drillFilter(card, clicked.value, clicked.column);
        const breakoutFields = Query.getBreakoutFields(
            newCard.dataset_query.query,
            tableMetadata
        );
        for (const [index, field] of breakoutFields.entries()) {
            if (field && field.id === clicked.column.id) {
                newCard.dataset_query.query = Query.removeBreakout(
                    newCard.dataset_query.query,
                    index
                );
            }
        }
    } else {
        newCard = startNewCard("query");
        newCard.dataset_query = card.dataset_query;
    }

    newCard.dataset_query.query = Query.addBreakout(
        newCard.dataset_query.query,
        breakout
    );

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

const guessVisualization = (card: Card, tableMetadata: TableMetadata) => {
    const aggregations = Query.getAggregations(card.dataset_query.query);
    const breakoutFields = Query.getBreakouts(card.dataset_query.query).map(
        breakout => (Q.getFieldTarget(breakout, tableMetadata) || {}).field
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
            } else {
                card.display = "bar";
            }
        }
    } else {
        console.warn("Couldn't guess visualization", card);
        card.display = "table";
    }
};
