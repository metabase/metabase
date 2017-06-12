/* @flow weak */

import Question from "../Question";
import Query from "./Query";

import _ from "underscore";

import type {
    AtomicDatasetQuery,
    DatasetQuery,
    MultiDatasetQuery,
} from "metabase/meta/types/Card";
import StructuredQuery, { isStructuredDatasetQuery } from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery, { isNativeDatasetQuery } from "metabase-lib/lib/queries/NativeQuery";
import { memoize } from "metabase-lib/lib/utils";
import Action, { ActionClick } from "../Action";
import Dimension, { DatetimeFieldDimension } from "metabase-lib/lib/Dimension";
import AtomicQuery from "./AtomicQuery";
import Metric from "metabase-lib/lib/metadata/Metric";

export const MULTI_QUERY_TEMPLATE: MultiDatasetQuery = {
    type: "multi",
    queries: []
};

export function isMultiDatasetQuery(datasetQuery: DatasetQuery) {
    return datasetQuery.type === MULTI_QUERY_TEMPLATE.type;
}

export function createAtomicQuery(question: Question, datasetQuery: AtomicDatasetQuery): Query {
    if (isStructuredDatasetQuery(datasetQuery)) {
        return new StructuredQuery(question, datasetQuery);
    } else if (isNativeDatasetQuery(datasetQuery)) {
        return new NativeQuery(question, datasetQuery);
    }

    throw new Error("Unknown query type: " + datasetQuery.type);
}

// TODO Atte Keinänen 6/8/17: Write comprehensive unit tests for this class and exported methods

/**
 * Converts a {@link DatasetQuery} to a {@link MultiDatasetQuery}.
 *
 * Because each query contained by MultiDatasetQuery should have just a single aggregation, {@link StructuredQuery}s
 * with two or more aggregations are broken into queries with one of those aggregations in each.
 */
export function convertToMultiDatasetQuery(question: Question, datasetQuery: DatasetQuery) {
    const getConvertedQueries = () => {
        if (isStructuredDatasetQuery(datasetQuery)) {
            const structuredQuery: StructuredQuery = new StructuredQuery(question, datasetQuery);
            const aggregations = structuredQuery.aggregations();
            const isMultiAggregationQuery = aggregations.length > 1;

            if (isMultiAggregationQuery) {
                // Each aggregation is isolated to its own StructuredQuery
                return aggregations.map((aggregation) => (
                    structuredQuery.clearAggregations().addAggregation(aggregation).datasetQuery()
                ));
            } else {
                return [datasetQuery];
            }
        } else {
            throw new Error("Native queries can't yet be converted to MultiDatasetQuery")
        }
    }

    if (isMultiDatasetQuery(datasetQuery)) return datasetQuery;

    return {
        ...MULTI_QUERY_TEMPLATE,
        queries: getConvertedQueries()
    };
}

/**
 * Represents a composite query that is composed from multiple structured / native queries.
 */
export default class MultiQuery extends Query {
    // For Flow type completion
    _multiDatasetQuery: MultiDatasetQuery;

    getInvalidParamsError = (message) =>
        new Error(`You tried to call MultiQuery constructor with invalid parameters: ${message}`);

    constructor(
        question: Question,
        datasetQuery?: DatasetQuery = MULTI_QUERY_TEMPLATE
    ) {
        super(question, datasetQuery);

        // $FlowFixMe Cast to MultiDatasetQuery for type completion
        this._multiDatasetQuery = datasetQuery;

        if (this._multiDatasetQuery.type !== "multi") {
            throw this.getInvalidParamsError("The type of datasetQuery isn't `multi`");
        }
        if (!_.isArray(this._multiDatasetQuery.queries)) {
            throw this.getInvalidParamsError("datasetQuery doesn't contain the `queries` array");
        }
    }

    /******* Query superclass methods *******/

    canRun(): boolean {
        return _.every(this.atomicQueries(), query => query.canRun());
    }

    /**
     * Top level actions that can be performed on this query
     * TODO: Move the current actions code from Questions and adapt for multi-queries
     */
    actions(): Action[] {
        // Notes from Slack conversation:
        // sameer: the bottom right actions should always refer to the thing in the entire query builder
        // if you click on the series name in a legend it might make sense to show its actions
        // [...] a question has actions available to it that are determined by its contents (and potentially the user),
        // regardless of whether it has a single or multiple queries inside of it
        return [];
    }

    /**
     * Drill through actions that can be performed on a part of the result setParameter
     * TODO: Move the current actions code from Questions and adapt for multi-queries
     */
    actionsForClick(click: ActionClick): Action[] {
        return [];
    }

    /******* Methods unique to this query type *******/

    /* Access to / manipulation of the query list */

    /**
     * Wrap individual queries to Query objects for a convenient access
     */
    @memoize atomicQueries(): AtomicQuery[] {
        return this._multiDatasetQuery.queries.map((datasetQuery) => createAtomicQuery(this._originalQuestion, datasetQuery));
    }

    /**
     * Replaces the atomic query at an index with the given atomic query
     */
    setQueryAtIndex(index: number, atomicQuery: AtomicQuery): MultiQuery {
        return this._updateQueries(this.atomicQueries().map((query, i) =>
            index === i ? atomicQuery : query)
        );
    }

    /**
     * Sets the atomic query at an index using a given updater function in a similar fashion as Icepick's `updateIn`
     */
    setQueryAtIndexWith(index: number, updater: (AtomicQuery) => AtomicQuery): MultiQuery {
        return this.setQueryAtIndex(index, updater(this.atomicQueries()[index]));
    }

    canRemoveQuery(): boolean {
        return this.atomicQueries().length > 1;
    }

    removeQueryAtIndex(index: number): MultiQuery {
        return this._updateQueries(this.atomicQueries().filter((_, i) => i !== index));
    }

    canAddQuery(): boolean {
        return true;
    }

    addQuery(atomicQuery: AtomicQuery): MultiQuery {
        return this._updateQueries([...this.atomicQueries(), atomicQuery]);
    }

    /* Specialized query list manipulation */
    addSavedMetric(metric: Metric): MultiQuery {
        const sharedDimension = this.sharedDimension();
        // sharedDimension.field().isDate() !== field.isDate()
        // sharedDimension.field().isNumeric() !== field.isNumeric()
        // sharedDimension.field().id !== field.id
        if (sharedDimension instanceof DatetimeFieldDimension) {
            // A possible more generalized approach (discuss with Tom):
            // metric.table.fields.filter(field => sharedDimension.allowedFieldTypes().contains(field.fieldType()))
            const compatibleFields = metric.table.fields.filter(field => field.isDate());
            if (compatibleFields.length === 0) {
                throw new Error("Tried to add a metric that doesn't have any compatible fields for the shared breakout")
            }

            const breakoutDimension = new DatetimeFieldDimension(compatibleFields[0].dimension(), [sharedDimension.bucketing()])

            const metricQuery = StructuredQuery
                .newStucturedQuery({ question: this, databaseId: metric.table.db.id, tableId: metric.table.id })
                .addAggregation(metric.aggregationClause())
                .addBreakout(breakoutDimension.mbql());

            return this.addQuery(metricQuery);
        } else {
            throw new Error("Can't currently add a metric a question with a non-datetime breakout")
        }
    }

    /* Shared x-axis dimension */

    /**
     * Returns the x-axis dimension that is currently shared by all atomic queries.
     */

    sharedDimension(): Dimension {
        const firstQuery = this.atomicQueries()[0]

        if (firstQuery instanceof StructuredQuery && firstQuery.breakouts().length === 1) {
            return Dimension.parseMBQL(firstQuery.breakouts()[0]);
        } else {
            throw new Error("Cannot infer the shared dimension from the first query of MultiQuery")
        }
    }

    /**
     * Helper for updating with functions that expect a DatasetQuery
     */
    update(fn: (datasetQuery: DatasetQuery) => void) {
        return fn(this.datasetQuery());
    }

    /* Internal methods */
    _updateQueries(queries: AtomicQuery[]) {
        return new MultiQuery(this._originalQuestion, {
            ...this.datasetQuery(),
            queries: queries.map((query) => query.datasetQuery())
        });
    }
}
