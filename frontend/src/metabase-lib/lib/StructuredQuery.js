import Query from "./Query";

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

import type {
    StructuredQuery as StructuredQueryObject,
    Aggregation,
    Breakout,
    Filter,
    LimitClause,
    OrderBy
} from "metabase/meta/types/Query";
import type {
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

export default class StructuredQuery extends Query {
    isStructured(): boolean {
        return true;
    }

    isEditable(): boolean {
        return !!this.tableMetadata();
    }

    query(): StructuredQueryObject {
        // $FlowFixMe
        return this._datasetQuery.query;
    }

    // legacy
    tableMetadata(): ?TableMetadata {
        if (this.isStructured()) {
            // $FlowFixMe
            return this._metadata.tables[this._datasetQuery.query.source_table];
        }
    }

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

    equalsToMetric(metric: Metric) {
        const aggregations = this.aggregations();
        if (aggregations.length !== 1) return false;

        const agg = aggregations[0];
        return AggregationClause.isMetric(agg) && AggregationClause.getMetric(agg) === metric.id;
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

    // INTERNAL

    _updateQuery(
        updateFunction: (
            query: StructuredQueryObject,
            ...args: any[]
        ) => StructuredQueryObject,
        args: any[]
    ) {
        return new StructuredQuery(
            this._question,
            updateIn(this._datasetQuery, ["query"], query =>
                updateFunction(query, ...args))
        );
    }
}
