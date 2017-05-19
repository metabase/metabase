/* @flow */

import Database from "./metadata/Database";
import Table from "./metadata/Table";

import Question from "./Question";
import Dimension from "./Dimension";
import Action, { ActionClick } from "./Action";

import _ from "underscore";

import Q from "metabase/lib/query";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type {
    StructuredQuery,
    Aggregation,
    Breakout,
    Filter,
    OrderBy
} from "metabase/meta/types/Query";
import type {
    Metadata as MetadataObject,
    TableMetadata
} from "metabase/meta/types/Metadata";

/**
 * This is a wrapper around a single MBQL or Native query
 */
export default class Query {
    _metadata: MetadataObject;
    _question: Question;
    _datasetQuery: DatasetQuery;

    constructor(question: Question, datasetQuery: DatasetQuery) {
        this._metadata = question._metadata;
        this._question = question;
        this._datasetQuery = datasetQuery;
    }

    isStructured(): boolean {
        return this._datasetQuery.type === "query";
    }
    isNative(): boolean {
        return this._datasetQuery.type === "native";
    }

    // legacy
    tableMetadata(): ?TableMetadata {
        if (this.isStructured()) {
            // $FlowFixMe
            return this._metadata.tables[this._datasetQuery.query.source_table];
        }
    }
    // datasetQuery
    datasetQuery(): DatasetQuery {
        return this._datasetQuery;
    }

    query(): StructuredQuery {
        // $FlowFixMe
        return this._datasetQuery.query;
    }

    isEditable(): boolean {
        return !!this.tableMetadata();
    }

    setDatabase(database: Database) {}

    setTable(table: Table) {}

    // AGGREGATIONS

    aggregations(): Aggregation[] {
        return Q.getAggregations(this.query());
    }
    aggregationOptions(): any[] {
        return [];
    }
    canAddAggregation(): boolean {
        return false;
    }

    isBareRows(): boolean {
        return Q.isBareRows(this.query());
    }

    // BREAKOUTS

    breakouts(): Breakout[] {
        return Q.getBreakouts(this.query());
    }
    breakoutableDimensions(breakout?: any): Dimension[] {
        const tableMetadata = this.tableMetadata();
        if (!tableMetadata) {
            return [];
        }

        const usedFields = {};
        for (const b of this.breakouts()) {
            if (!breakout || !_.isEqual(b, breakout)) {
                usedFields[Q.getFieldTargetId(b)] = true;
            }
        }

        return Q.getFieldOptions(
            tableMetadata.fields,
            true,
            tableMetadata.breakout_options.validFieldsFilter,
            usedFields
        );
    }
    canAddBreakout(): boolean {
        return false;
    }

    // FILTERS

    filters(): Filter[] {
        return Q.getFilters(this.query());
    }
    filterableDimensions(): Dimension[] {
        return [];
    }
    canAddFilter(): boolean {
        return Q.canAddFilter(this.query());
    }

    // SORTS

    sorts(): OrderBy[] {
        return [];
    }
    sortOptions(): any[] {
        return [];
    }
    canAddSort(): boolean {
        return false;
    }

    expressions(): { [key: string]: any } {
        return Q.getExpressions(this.query());
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
