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
    @nyi setDatabase(database: Database) {}

    @nyi setTable(table: Table) {}

    // AGGREGATIONS

    @nyi aggregations(): Aggregation[] {
        return [];
    }
    @nyi aggregationOptions(): AggregationOption[] {
        return [];
    }
    @nyi canAddAggregation(): boolean {
        return false;
    }

    // BREAKOUTS

    @nyi breakouts(): Breakout[] {
        return [];
    }
    @nyi breakoutableDimensions(unused: boolean = false): Dimension[] {
        return [];
    }
    @nyi canAddBreakout(): boolean {
        return false;
    }

    // FILTERS

    @nyi filters(): Filter[] {
        return [];
    }
    @nyi filterableDimensions(): Dimension[] {
        return [];
    }
    @nyi canAddFilter(): boolean {
        return false;
    }

    // SORTS

    @nyi sorts(): Sort[] {
        return [];
    }
    @nyi sortOptions(): SortOption[] {
        return [];
    }
    @nyi canAddSort(): boolean {
        return false;
    }

    // LIMIT

    @nyi setLimit(limit: number): void {}

    // NATIVE QUERY

    @nyi getNativeQuery(): string {
        // this requires the result dataset, or a call to the server
        return "";
    }
    @nyi convertToNativeQuery() {
        // this requires the result dataset, or a call to the server
    }

    /**
     * Top level actions that can be performed on this query
     */
    @nyi actions(): Action[] {
        return [];
    }

    /**
     * Drill through actions that can be performed on a part of the result setParameter
     */
    @nyi actionsForClick(click: ActionClick): Action[] {
        return [];
    }

    /**
     * Query is valid (as far as we know) and can be executed
     */
    @nyi canRun(): boolean {
        return false;
    }

    /**
     * Run the query
     */
    @nyi run() {}
}
