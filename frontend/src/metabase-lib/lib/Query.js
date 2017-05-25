/* @flow */

import Database from "./metadata/Database";
import Table from "./metadata/Table";
import Field from "./metadata/Field";

import Question from "./Question";
import Action, { ActionClick } from "./Action";

import { ExpressionDimension } from "./Dimension";

import { TYPE } from "metabase/lib/types";
import * as Q from "metabase/lib/query/query";
import Q_deprecated, {
    AggregationClause,
    NamedClause
} from "metabase/lib/query";
import { format as formatExpression } from "metabase/lib/expressions/formatter";
import { getAggregator } from "metabase/lib/schema_metadata";

import _ from "underscore";
import { updateIn } from "icepick";

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

import Dimension from "metabase-lib/lib/Dimension";

// TODO: replace this with a list of Dimension objects
type FieldOptions = {
    count: 0,
    dimensions: Dimension[],
    fks: Array<{
        field: FieldMetadata,
        dimensions: Dimension[]
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

    /* convenience for questions with a single aggregation */
    aggregation(): Aggregation {
        return aggregations()[0];
    }

    aggregations(): Aggregation[] {
        return Q.getAggregations(this.query());
    }
    aggregationOptions(): any[] {
        // legacy
        return this.tableMetadata().aggregation_options;
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

    aggregationName(index: number = 0): string {
        if (this.isStructured()) {
            const aggregation = this.aggregations()[0];
            if (NamedClause.isNamed(aggregation)) {
                return NamedClause.getName(aggregation);
            } else if (AggregationClause.isCustom(aggregation)) {
                return formatExpression(aggregation, {
                    tableMetadata: this.tableMetadata(),
                    customFields: this.expressions()
                });
            } else if (AggregationClause.isMetric(aggregation)) {
                const metricId = AggregationClause.getMetric(aggregation);
                const metric = this._metadata.metrics[metricId];
                if (metric) {
                    return metric.name;
                }
            } else {
                const selectedAggregation = getAggregator(
                    AggregationClause.getOperator(aggregation)
                );
                if (selectedAggregation) {
                    let aggregationName = selectedAggregation.name.replace(
                        " of ...",
                        ""
                    );
                    const fieldId = Q_deprecated.getFieldTargetId(
                        AggregationClause.getField(aggregation)
                    );
                    const field = fieldId && this._metadata.fields[fieldId];
                    if (field) {
                        aggregationName += " of " + field.display_name;
                    }
                    return aggregationName;
                }
            }
        }
        return "";
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
    breakoutOptions(breakout?: any): FieldOptions {
        const fieldOptions = {
            count: 0,
            fks: [],
            dimensions: []
        };

        const table = this.tableMetadata();
        if (table) {
            // the set of field ids being used by other breakouts
            const usedFields = new Set(
                this.breakouts()
                    .filter(b => !_.isEqual(b, breakout))
                    .map(b => Q_deprecated.getFieldTargetId(b))
            );

            const dimensionFilter = dimension => {
                const field = dimension.field && dimension.field();
                return !field ||
                    (field.isDimension() && !usedFields.has(field.id));
            };

            for (const dimension of this.dimensions().filter(dimensionFilter)) {
                const field = dimension.field && dimension.field();
                if (field && field.isFK()) {
                    const fkDimensions = dimension
                        .dimensions()
                        .filter(dimensionFilter);
                    if (fkDimensions.length > 0) {
                        fieldOptions.count += fkDimensions.length;
                        fieldOptions.fks.push({
                            field: field,
                            dimension: dimension,
                            dimensions: fkDimensions
                        });
                    }
                }
                // else {
                fieldOptions.count++;
                fieldOptions.dimensions.push(dimension);
                // }
            }
        }

        return fieldOptions;
    }
    canAddBreakout(): boolean {
        return this.breakoutOptions().count > 0;
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
    filterOptions(): FieldOptions {
        return { count: 0, dimensions: [], fks: [] };
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

    // DIMENSIONS

    dimensions(): Dimension[] {
        return [...this.expressionDimensions(), ...this.tableDimensions()];
    }

    tableDimensions(): Dimension[] {
        // $FlowFixMe
        const table: Table = this.tableMetadata();
        return table ? table.dimensions() : [];
    }

    expressionDimensions(): Dimension[] {
        return Object.entries(this.expressions()).map(([
            expressionName,
            expression
        ]) => {
            return new ExpressionDimension(null, [expressionName]);
        });
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
        // TODO:
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
