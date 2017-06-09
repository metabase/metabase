/* @flow weak */

import Question from "./Question";
import Query from "./Query";

import _ from "underscore";

import StructuredQuery from "metabase-lib/lib/StructuredQuery";
import NativeQuery from "metabase-lib/lib/NativeQuery";
import { memoize } from "metabase-lib/lib/utils";
import Action, { ActionClick } from "./Action";

import type {
    ChildDatasetQuery,
    DatasetQuery,
    MultiDatasetQuery
} from "metabase/meta/types/Card";

export const MULTI_QUERY_TEMPLATE: MultiDatasetQuery = {
    type: "multi",
    queries: []
};

function createChildQuery(
    question: Question,
    datasetQuery: ChildDatasetQuery
): Query {
    if (StructuredQuery.isDatasetQueryType(datasetQuery)) {
        return new StructuredQuery(question, datasetQuery);
    } else if (NativeQuery.isDatasetQueryType(datasetQuery)) {
        return new NativeQuery(question, datasetQuery);
    }

    throw new Error("Unknown query type: " + datasetQuery.type);
}

// TODO Atte Keinänen 6/8/17: Write comprehensive unit tests for this class

/**
 * Converts the DatasetQuery to a MultiDatasetQuery.
 *
 * Because each query contained by MultiDatasetQuery should have just a single aggregation, StructuredQueries
 * with two or more aggregations are broken into queries with one of those aggregations in each.
 */
export function convertToMultiDatasetQuery(
    question: Question,
    datasetQuery: DatasetQuery
) {
    const getConvertedQueries = () => {
        if (StructuredQuery.isDatasetQueryType(datasetQuery)) {
            const structuredQuery: StructuredQuery = new StructuredQuery(
                question,
                datasetQuery
            );
            const aggregations = structuredQuery.aggregations();
            const isMultiAggregationQuery = aggregations.length > 1;

            if (isMultiAggregationQuery) {
                // Each aggregation is isolated to its own StructuredQuery

                // TODO Atte Keinänen 6/6/17: The following logic needs further clarification, talk with @mazameli
                // In Question terminology those can be considered as either ad-hoc metrics (if there are filters/breakouts applied)
                // or as saved metrics (if the original datasetQuery only contains the saved metric aggregation and no filters/breakouts)
                return aggregations.map(aggregation =>
                    structuredQuery
                        .clearAggregations()
                        .addAggregation(aggregation)
                        .datasetQuery());
            } else {
                return [datasetQuery];
            }
        } else {
            throw new Error(
                "Native queries can't yet be converted to MultiDatasetQuery"
            );
        }
    };

    return {
        ...MULTI_QUERY_TEMPLATE,
        queries: getConvertedQueries()
    };
}

/**
 * Represents a composite query that is composed from multiple structured / native queries.
 */
export default class MultiQuery extends Query {
    static isDatasetQueryType(datasetQuery: DatasetQuery) {
        return datasetQuery.type === MULTI_QUERY_TEMPLATE.type;
    }

    // For Flow type completion
    _multiDatasetQuery: MultiDatasetQuery;

    getInvalidParamsError = message =>
        new Error(
            `You've tried to call MultiQuery constructor with invalid parameters: ${message}`
        );

    constructor(
        question: Question,
        datasetQuery?: MultiDatasetQuery = MULTI_QUERY_TEMPLATE
    ) {
        super(question, datasetQuery);

        this._multiDatasetQuery = datasetQuery;

        if (this._multiDatasetQuery.type !== "multi") {
            throw this.getInvalidParamsError(
                "The type of datasetQuery isn't `multi`"
            );
        }
        if (!_.isArray(this._multiDatasetQuery.queries)) {
            throw this.getInvalidParamsError(
                "datasetQuery doesn't contain the `queries` array"
            );
        }
    }

    /* Query superclass methods */

    canRun(): boolean {
        return _.every(this.childQueries(), query => query.canRun());
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

    /* Methods unique to this query type */

    /**
     * Wrap individual queries to Query objects for a convenient access
     */
    @memoize childQueries(): Query[] {
        return this._multiDatasetQuery.queries.map(datasetQuery =>
            createChildQuery(this._originalQuestion, datasetQuery));
    }

    setQueryAtIndex(
        index: number,
        datasetQuery: ChildDatasetQuery
    ): MultiQuery {
        return this._updateQueries(
            this.childQueries().map(
                (query, i) =>
                    index === i
                        ? createChildQuery(this._originalQuestion, datasetQuery)
                        : query
            )
        );
    }

    removeQueryAtIndex(index: number): MultiQuery {
        return this._updateQueries(
            this.childQueries().filter((_, i) => i !== index)
        );
    }

    canAddQuery(): boolean {
        // TODO Atte Keinänen 6/6/17: Which rules should apply here?
        // Old rules used in
        // only structured queries with 0 or 1 breakouts can have multiple series
        // const query = this.query();
        // return query instanceof StructuredQuery && query.breakouts().length <= 1;

        return true;
    }

    // TODO Should this accept just a Query object instead or not?
    addQuery(datasetQuery: ChildDatasetQuery): MultiQuery {
        return this._updateQueries([
            ...this.childQueries(),
            createChildQuery(this._originalQuestion, datasetQuery)
        ]);
    }

    /**
     * Helper for updating with functions that expect a DatasetQuery
     */
    update(fn: (datasetQuery: DatasetQuery) => void) {
        return fn(this.datasetQuery());
    }

    /* Internal methods */
    _updateQueries(queries: Query[]) {
        // $FlowFixMe
        const datasetQuery: MultiDatasetQuery = this.datasetQuery();
        return new MultiQuery(this._originalQuestion, {
            ...datasetQuery,
            queries: queries.map(query => query.datasetQuery())
        });
    }
}
