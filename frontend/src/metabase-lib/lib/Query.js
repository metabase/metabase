/* @flow */

import { nyi } from "./utils";

import Database from "./metadata/Database";
import Table from "./metadata/Table";

import Aggregation, { AggregationOption } from "./query/Aggregation";
import Breakout from "./query/Breakout";
import Filter from "./query/Filter";
import Sort, { SortOption } from "./query/Sort";

import Dimension from "./Dimension";
import Action, { ActionClick } from "./Action";

/**
 * This is a wrapper around a single MBQL or Native query
 */
export default class Query {
    setDatabase(database: Database) {}

    setTable(table: Table) {}

    // AGGREGATIONS

    aggregations(): Aggregation[] {
        return [];
    }
    aggregationOptions(): AggregationOption[] {
        return [];
    }
    canAddAggregation(): boolean {
        return false;
    }

    // BREAKOUTS

    breakouts(): Breakout[] {
        return [];
    }
    breakoutableDimensions(unused: boolean = false): Dimension[] {
        return [];
    }
    canAddBreakout(): boolean {
        return false;
    }

    // FILTERS

    filters(): Filter[] {
        return [];
    }
    filterableDimensions(): Dimension[] {
        return [];
    }
    canAddFilter(): boolean {
        return false;
    }

    // SORTS

    sorts(): Sort[] {
        return [];
    }
    sortOptions(): SortOption[] {
        return [];
    }
    canAddSort(): boolean {
        return false;
    }

    // LIMIT

    setLimit(limit: number): void {}

    // NATIVE QUERY

    getNativeQuery(): string {
        // this requires the result dataset, or a call to the server
        return "";
    }
    convertToNativeQuery() {
        // this requires the result dataset, or a call to the server
    }

    /**
     * Top level actions that can be performed on this query
     */
    actions(): Action[] {
        return [];
    }

    /**
     * Drill through actions that can be performed on a part of the result setParameter
     */
    actionsForClick(click: ActionClick): Action[] {
        return [];
    }

    /**
     * Query is valid (as far as we know) and can be executed
     */
    canRun(): boolean {
        return false;
    }

    /**
     * Run the query
     */
    run() {}
}
