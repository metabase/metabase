/* @flow weak */

/**
 * Represents a structured MBQL query.
 *
 * Although MultiQuery has superseded the multi-aggregation functionality of StructuredQuery, this class still
 * contains the multi-aggregation support for dealing with `dataset_query` objects that are in a legacy format.
 *
 * TODO Atte Keinänen 6/6/17: Should the multi-aggregation questions be automatically converted to MultiQuery or not?
 */

import * as Q from "metabase/lib/query/query";
import Q_deprecated, {
    AggregationClause,
    NamedClause
} from "metabase/lib/query";
import { format as formatExpression } from "metabase/lib/expressions/formatter";
import { getAggregator } from "metabase/lib/schema_metadata";

import _ from "underscore";
import { chain, assoc, updateIn } from "icepick";

import type {
    StructuredQuery as StructuredQueryObject,
    Aggregation,
    Breakout,
    Filter,
    LimitClause,
    OrderBy
} from "metabase/meta/types/Query";
import type {
    DatasetQuery,
    StructuredDatasetQuery
} from "metabase/meta/types/Card";
import type {
    TableMetadata,
    DimensionOptions
} from "metabase/meta/types/Metadata";

import Dimension, {
    ExpressionDimension,
    AggregationDimension
} from "metabase-lib/lib/Dimension";

import type Table from "../metadata/Table";
import type { DatabaseEngine, DatabaseId } from "metabase/meta/types/Database";
import type Database from "../metadata/Database";
import type Question from "../Question";
import { TableId } from "metabase/meta/types/Table";
import AtomicQuery from "./AtomicQuery";
import AggregationWrapper from './Aggregation';

const STRUCTURED_QUERY_TEMPLATE = {
    database: null,
    type: "query",
    query: {
        source_table: null
    }
};

export function isStructuredDatasetQuery(datasetQuery: DatasetQuery) {
    return datasetQuery.type === STRUCTURED_QUERY_TEMPLATE.type;
}

export default class StructuredQuery extends AtomicQuery {
    // For Flow type completion
    _structuredDatasetQuery: StructuredDatasetQuery;

    constructor(
        question: Question,
        datasetQuery: DatasetQuery = STRUCTURED_QUERY_TEMPLATE
    ) {
        super(question, datasetQuery);

        // $FlowFixMe
        this._structuredDatasetQuery = datasetQuery;
    }

    static newStucturedQuery({question, databaseId, tableId}: { question: Question, databaseId?: DatabaseId, tableId?: TableId }) {
        const datasetQuery = {
            ...STRUCTURED_QUERY_TEMPLATE,
            database: databaseId || null,
            query: {
                source_table: tableId || null
            }
        }

        return new StructuredQuery(question, datasetQuery);
    }

    /* Query superclass methods */

    canRun() {
        return true;
    }

    isEditable(): boolean {
        return !!this.tableMetadata();
    }

    /* AtomicQuery superclass methods */

    tables(): ?(Table[]) {
        const database = this.database();
        return (database && database.tables) || null;
    }
    databaseId(): ?DatabaseId {
        // same for both structured and native
        return this._structuredDatasetQuery.database;
    }
    database(): ?Database {
        const databaseId = this.databaseId();
        return databaseId != null ? this._metadata.databases[databaseId] : null;
    }
    engine(): ?DatabaseEngine {
        const database = this.database();
        return database && database.engine;
    }

    /* Methods unique to this query type */

    reset(): StructuredQuery {
        return new StructuredQuery(this._originalQuestion);
    }

    query(): StructuredQueryObject {
        // $FlowFixMe
        return this._datasetQuery.query;
    }

    // legacy
    tableMetadata(): ?TableMetadata {
        return this._metadata.tables[this._datasetQuery.query.source_table];
    }

    setDatabase(database: Database) {
        if (database.id !== this.databaseId()) {
            return this.reset().setDatasetQuery(
                assoc(this.datasetQuery(), "database", database.id)
            );
        } else {
            return this;
        }
    }

    setTable(table: Table) {
        if (table.id !== this.tableId()) {
            return this.reset().setDatasetQuery(
                chain(this.datasetQuery())
                    .assoc("database", table.database.id)
                    .assocIn(["query", "source_table"], table.id)
                    .value()
            );
        } else {
            return this;
        }
    }

    tableId() {
        return this.query().source_table;
    }

    table() {
        return this._metadata.tables[this.tableId()];
    }

    // AGGREGATIONS
    aggregations(): Aggregation[] {
        return Q.getAggregations(this.query());
    }

    // TODO Atte Keinänen 6/11/17: Make the wrapper objects the standard format for aggregations
    wrappedAggregations(): AggregationWrapper[] {
        return this.aggregations().map(agg => new AggregationWrapper(agg));
    }

    aggregationOptions(): any[] {
        return this.table().aggregations();
    }
    aggregationFieldOptions(agg): DimensionOptions {
        const aggregation = this.table().aggregation(agg);
        if (aggregation) {
            return this.fieldOptions(
                null,
                field => aggregation.validFieldsFilters[0]([field]).length === 1
            );
        } else {
            return { count: 0, fks: [], dimensions: [] };
        }
    }

    canRemoveAggregation(): boolean {
        return this.aggregations().length > 1;
    }

    isBareRows(): boolean {
        return Q.isBareRows(this.query());
    }

    aggregationName(index: number = 0): string {
        const aggregation = this.aggregations()[index];
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

        return "";
    }

    /**
     * For dealing with the legacy multi-aggregation queries
     */
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
    breakoutOptions(breakout?: any, fieldFilter = () => true) {
        return this.fieldOptions(breakout, fieldFilter);
    }

    canAddBreakout(): boolean {
        return this.breakoutOptions().count > 0;
    }
    hasValidBreakout(): boolean {
        return Q_deprecated.hasValidBreakout(this.query());
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
    filterFieldOptions(): DimensionOptions {
        return this.fieldOptions();
    }
    filterSegmentOptions() {
        return this.table().segments.filter(sgmt => sgmt.is_active === true);
    }
    canAddFilter(): boolean {
        return Q.canAddFilter(this.query()) &&
            (this.filterFieldOptions().count > 0 ||
                this.filterSegmentOptions().length > 0);
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

    aggregationDimensions() {
        return this.breakouts().map(breakout =>
            Dimension.parseMBQL(breakout, this._metadata));
    }
    metricDimensions() {
        return this.aggregations().map(
            (aggregation, index) =>
                new AggregationDimension(
                    null,
                    [index],
                    this._metadata,
                    aggregation[0]
                )
        );
    }

    sorts(): OrderBy[] {
        return Q.getOrderBys(this.query());
    }
    sortOptions(sort, fieldFilter): DimensionOptions {
        let sortOptions = { count: 0, dimensions: [], fks: [] };
        // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
        if (this.isBareRows()) {
            sortOptions = this.fieldOptions(sort, fieldFilter);
        } else if (this.hasValidBreakout()) {
            for (const breakout of this.breakouts()) {
                sortOptions.dimensions.push(
                    Dimension.parseMBQL(breakout, this._metadata)
                );
                sortOptions.count++;
            }
            for (const [index, aggregation] of this.aggregations().entries()) {
                if (Q_deprecated.canSortByAggregateField(this.query(), index)) {
                    sortOptions.dimensions.push(
                        new AggregationDimension(
                            null,
                            [index],
                            this._metadata,
                            aggregation[0]
                        )
                    );
                    sortOptions.count++;
                }
            }
        }
        return sortOptions;
    }
    canAddSort(): boolean {
        const sorts = this.sorts();
        return this.sortOptions().count > 0 &&
            (sorts.length === 0 || sorts[sorts.length - 1][0] != null);
    }

    addSort(order_by: OrderBy) {
        return this._updateQuery(Q.addOrderBy, arguments);
    }
    updateSort(index: number, order_by: OrderBy) {
        return this._updateQuery(Q.updateOrderBy, arguments);
    }
    removeSort(index: number) {
        return this._updateQuery(Q.removeOrderBy, arguments);
    }
    clearSort() {
        return this._updateQuery(Q.clearOrderBy, arguments);
    }
    replaceSort(order_by: OrderBy) {
        return this.clearSort().addSort(order_by);
    }

    // LIMIT

    limit(): ?number {
        return Q.getLimit(this.query());
    }
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

    updateExpression(name, expression, oldName) {
        return this._updateQuery(Q.updateExpression, arguments);
    }

    removeExpression(name) {
        return this._updateQuery(Q.removeExpression, arguments);
    }

    // FIELD OPTIONS

    fieldOptions(fieldRef?: any, fieldFilter = () => true): DimensionOptions {
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
                    .filter(b => !_.isEqual(b, fieldRef))
                    .map(b => Q_deprecated.getFieldTargetId(b))
            );

            const dimensionFilter = dimension => {
                const field = dimension.field && dimension.field();
                return !field ||
                    (field.isDimension() &&
                        fieldFilter(field) &&
                        !usedFields.has(field.id));
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
                fieldOptions.count++;
                fieldOptions.dimensions.push(dimension);
            }
        }

        return fieldOptions;
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

    fieldReferenceForColumn(column) {
        if (column.fk_field_id != null) {
            return ["fk->", column.fk_field_id, column.id];
        } else if (column.id != null) {
            return ["field-id", column.id];
        } else if (column["expression-name"] != null) {
            return ["expression", column["expression-name"]];
        } else if (column.source === "aggregation") {
            // FIXME: aggregations > 0?
            return ["aggregation", 0];
        }
    }

    parseFieldReference(fieldRef): ?Dimension {
        const dimension = Dimension.parseMBQL(fieldRef, this._metadata);
        if (dimension) {
            // HACK
            if (dimension instanceof AggregationDimension) {
                dimension._displayName = this.aggregations()[
                    dimension._args[0]
                ][0];
            }
            return dimension;
        }
    }

    // INTERNAL

    _updateQuery(
        updateFunction: (
            query: StructuredQueryObject,
            ...args: any[]
        ) => StructuredQueryObject,
        args: any[]
    ) {
        return new StructuredQuery(
            this._originalQuestion,
            updateIn(this._datasetQuery, ["query"], query =>
                updateFunction(query, ...args))
        );
    }
}
