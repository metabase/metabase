/* @flow */

import Database from "./metadata/Database";
import Table from "./metadata/Table";

import Question from "./Question";
import Dimension from "./Dimension";
import Action, { ActionClick } from "./Action";

import _ from "underscore";
import { updateIn } from "icepick";

import Q_deprecated from "metabase/lib/query";
import * as Q from "metabase/lib/query/query";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type {
    StructuredQuery,
    Aggregation,
    Breakout,
    Filter,
    LimitClause,
    OrderBy
} from "metabase/meta/types/Query";
import type {
    Metadata as MetadataObject,
    FieldMetadata,
    TableMetadata
} from "metabase/meta/types/Metadata";

// TODO: replace this with a list of Dimension objects
type FieldOptions = {
    count: 0,
    fields: FieldMetadata[],
    fks: Array<{
        field: FieldMetadata,
        fields: FieldMetadata[]
    }>
};

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
    canRemoveAggregation(): boolean {
        return this.aggregations().length > 1;
    }

    isBareRows(): boolean {
        return Q.isBareRows(this.query());
    }

    addAggregation(aggregation: Aggregation) {
        return this._updateQuery(Q.addAggregation, arguments);
    }
    updateAggregation(index: number, aggregation: Aggregation) {
        return this._updateQuery(Q.updateAggregation, arguments);
    }
    removeAggregation(index: number) {
        return this._updateQuery(Q.removeAggregation, arguments);
    }
    clearAggregations() {
        return this._updateQuery(Q.clearAggregations, arguments);
    }

    // BREAKOUTS

    breakouts(): Breakout[] {
        return Q.getBreakouts(this.query());
    }
    breakoutableDimensions(breakout?: any): FieldOptions {
        const tableMetadata = this.tableMetadata();
        if (!tableMetadata) {
            return { count: 0, fields: [], fks: [] };
        }

        const usedFields = {};
        for (const b of this.breakouts()) {
            if (!breakout || !_.isEqual(b, breakout)) {
                usedFields[Q_deprecated.getFieldTargetId(b)] = true;
            }
        }

        return Q_deprecated.getFieldOptions(
            tableMetadata.fields,
            true,
            tableMetadata.breakout_options.validFieldsFilter,
            usedFields
        );
    }
    canAddBreakout(): boolean {
        return this.breakoutableDimensions().count > 0;
    }

    addBreakout(breakout: Breakout) {
        return this._updateQuery(Q.addBreakout, arguments);
    }
    updateBreakout(index: number, breakout: Breakout) {
        return this._updateQuery(Q.updateBreakout, arguments);
    }
    removeBreakout(index: number) {
        return this._updateQuery(Q.removeBreakout, arguments);
    }
    clearBreakouts() {
        return this._updateQuery(Q.clearBreakouts, arguments);
    }

    // FILTERS

    filters(): Filter[] {
        return Q.getFilters(this.query());
    }
    filterableDimensions(): FieldOptions {
        return { count: 0, fields: [], fks: [] };
    }
    canAddFilter(): boolean {
        return Q.canAddFilter(this.query());
    }

    addFilter(filter: Filter) {
        return this._updateQuery(Q.addFilter, arguments);
    }
    updateFilter(index: number, filter: Filter) {
        return this._updateQuery(Q.updateFilter, arguments);
    }
    removeFilter(index: number) {
        return this._updateQuery(Q.removeFilter, arguments);
    }
    clearFilters() {
        return this._updateQuery(Q.clearFilters, arguments);
    }

    // SORTS

    // TODO: standardize SORT vs ORDER_BY terminology

    sorts(): OrderBy[] {
        return [];
    }
    sortOptions(): any[] {
        return [];
    }
    canAddSort(): boolean {
        return false;
    }

    addOrderBy(order_by: OrderBy) {
        return this._updateQuery(Q.addOrderBy, arguments);
    }
    updateOrderBy(index: number, order_by: OrderBy) {
        return this._updateQuery(Q.updateOrderBy, arguments);
    }
    removeOrderBy(index: number) {
        return this._updateQuery(Q.removeOrderBy, arguments);
    }
    clearOrderBy() {
        return this._updateQuery(Q.clearOrderBy, arguments);
    }

    // LIMIT

    updateLimit(limit: LimitClause) {
        return this._updateQuery(Q.updateLimit, arguments);
    }
    clearLimit() {
        return this._updateQuery(Q.clearLimit, arguments);
    }

    // EXPRESSIONS

    expressions(): { [key: string]: any } {
        return Q.getExpressions(this.query());
    }

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

    update(fn: (datasetQuery: DatasetQuery) => void) {
        return fn(this.datasetQuery());
    }

    // INTERNAL

    _updateQuery(
        updateFunction: (
            query: StructuredQuery,
            ...args: any[]
        ) => StructuredQuery,
        args: any[]
    ) {
        return new Query(
            this._question,
            updateIn(this._datasetQuery, ["query"], query =>
                updateFunction(query, ...args))
        );
    }
}
