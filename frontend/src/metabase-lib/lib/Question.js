/* @flow weak */

import Query from "./Query";
import Dimension from "./Dimension";
import Metric from "./metadata/Metric";
import Metadata from "./metadata/Metadata";

import Breakout from "./query/Breakout";
import Filter from "./query/Filter";

import Action, { ActionClick } from "./Action";

import type {
    Parameter as ParameterObject,
    ParameterId,
    ParameterValues
} from "metabase/meta/types/Parameter";
import type { DimensionOptions } from "metabase/meta/types/Metadata";
import type {
    Card as CardObject,
    DatasetQuery as DatasetQueryObject,
    StructuredDatasetQuery as StructuredDatasetQueryObject
} from "metabase/meta/types/Card";
// import type { StructuredQuery as StructuredQueryObject } from "metabase/meta/types/Query";

import StructuredQuery from "./StructuredQuery";
import NativeQuery from "./NativeQuery";

import * as Q from "metabase/lib/query/query";
import { getParametersWithExtras } from "metabase/meta/Card";

import { chain, updateIn } from "icepick";

// TODO: move these
type DownloadFormat = "csv" | "json" | "xlsx";
type RevisionId = number;
type ParameterOptions = "FIXME";

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
export default class Question {
    _metadata: Metadata;
    _card: CardObject;
    _parameterValues: ParameterValues;

    /**
     * A question has one or more queries
     */
    _queries: Query[];

    /**
     * Question constructor
     */
    constructor(
        metadata: Metadata,
        card: CardObject,
        parameterValues?: ParameterValues
    ) {
        this._metadata = metadata;
        this._card = card;
        this._parameterValues = parameterValues || {};

        if (
            card.dataset_query.type === "query" &&
            Q.getAggregations(card.dataset_query.query).length > 1
        ) {
            const datasetQuery: StructuredDatasetQueryObject = card.dataset_query;

            // TODO: real multiple metric persistence
            this._queries = Q.getAggregations(
                card.dataset_query.query
            ).map((aggregation, index) =>
                this.createQuery(
                    {
                        ...datasetQuery,
                        query: Q.addAggregation(
                            Q.clearAggregations(datasetQuery.query),
                            aggregation
                        )
                    },
                    index
                ));
        } else {
            this._queries = [this.createQuery(card.dataset_query, 0)];
        }
    }

    updateCard(card: CardObject) {
        return new Question(this._metadata, card, this._parameterValues);
    }

    newQuestion() {
        return this.updateCard(
            chain(this.card())
                .dissoc("id")
                .dissoc("name")
                .dissoc("description")
                .value()
        );
    }

    createQuery(datasetQuery: DatasetQueryObject, index: number): Query {
        if (datasetQuery.type === "query") {
            return new StructuredQuery(this, index, datasetQuery);
        } else if (datasetQuery.type === "native") {
            return new NativeQuery(this, index, datasetQuery);
        }
        throw new Error("Unknown query type: " + datasetQuery.type);
    }

    updateQuery(index: number, newQuery: Query): Question {
        if (newQuery instanceof StructuredQuery) {
            // TODO: real multiple metric persistence
            let query = Q.clearAggregations(newQuery.query());
            for (let i = 0; i < this._queries.length; i++) {
                query = Q.addAggregation(
                    query,
                    // $FlowFixMe
                    (i === index ? newQuery : this._queries[i]).aggregations()[
                        0
                    ]
                );
            }
            return this.updateCard({
                ...this._card,
                dataset_query: {
                    ...newQuery.datasetQuery(),
                    query: query
                }
            });
        } else {
            return this.updateCard({
                ...this._card,
                dataset_query: newQuery.datasetQuery()
            });
        }
    }

    card() {
        return this._card;
    }

    /**
     * Helper for single query centric cards
     */
    query(): Query {
        return this._queries[0];
    }

    datasetQuery(): DatasetQuery {
        return this._card && this._card.dataset_query;
    }

    display(): string {
        return this._card && this._card.display;
    }

    /**
     * Question is valid (as far as we know) and can be executed
     */
    canRun(): boolean {
        for (const query of this._queries) {
            if (!query.canRun()) {
                return false;
            }
        }
        return true;
    }

    canWrite(): boolean {
        return this._card && this._card.can_write;
    }

    metrics(): Query[] {
        return this._queries;
    }
    availableMetrics(): Metric[] {
        return this._metadata.metricsList();
    }
    canAddMetric(): boolean {
        // only structured queries with 0 or 1 breakouts can have multiple series
        const query = this.query();
        return query instanceof StructuredQuery &&
            query.breakouts().length <= 1;
    }
    canRemoveMetric(): boolean {
        // can't remove last metric
        return this.metrics().length > 1;
    }

    addSavedMetric(metric: Metric): Question {
        return this.addMetric(
            ({
                type: "query",
                database: metric.table.db.id,
                query: {
                    source_table: metric.table.id,
                    aggregation: [["METRIC", metric.id]]
                }
            }: StructuredDatasetQueryObject)
        );
    }
    addMetric(datasetQuery: StructuredDatasetQueryObject): Question {
        // TODO: multiple metrics persistence
        return this.updateCard(
            updateIn(this.card(), ["dataset_query", "query"], query =>
                Q.addAggregation(
                    query,
                    Q.getAggregations(datasetQuery.query)[0]
                ))
        );
    }
    updateMetric(index: number, metric: Query): Question {
        return this.updateQuery(index, metric);
    }
    removeMetric(index: number): Question {
        // TODO: multiple metrics persistence
        return this.updateCard(
            updateIn(this.card(), ["dataset_query", "query"], query =>
                Q.removeAggregation(query, index))
        );
    }

    // multiple series can be pivoted
    breakouts(): Breakout[] {
        // TODO: real multiple metric persistence
        const query = this.query();
        if (query instanceof StructuredQuery) {
            return query.breakouts();
        } else {
            return [];
        }
    }
    breakoutOptions(breakout?: any): DimensionOptions {
        // TODO: real multiple metric persistence
        const query = this.query();
        if (query instanceof StructuredQuery) {
            return query.breakoutOptions(breakout);
        } else {
            return {
                count: 0,
                fks: [],
                dimensions: []
            };
        }
    }
    canAddBreakout(): boolean {
        return this.breakouts() === 0;
    }

    // multiple series can be filtered by shared dimensions
    filters(): Filter[] {
        // TODO: real multiple metric persistence
        const query = this.query();
        return query instanceof StructuredQuery ? query.filters() : [];
    }
    filterOptions(): Dimension[] {
        // TODO: real multiple metric persistence
        const query = this.query();
        return query instanceof StructuredQuery ? query.filterOptions() : [];
    }
    canAddFilter(): boolean {
        return false;
    }

    // top-level actions
    actions(): Action[] {
        // if this is a single query question, the top level actions are
        // the querys actions
        if (this._queries.length === 1) {
            return this.query().actions();
        } else {
            // do something smart
            return [];
        }
    }

    // drill-through etc actions
    actionsForClick(click: ActionClick): Action[] {
        // if this is a single query question, the top level actions are
        // the querys actions
        if (this._queries.length === 1) {
            return this.query().actions();
        } else {
            // do something smart
            return [];
        }
    }

    /**
     * A user-defined name for the question
     */
    displayName(): string {
        return this._card && this._card.name;
    }

    id(): string {
        return this._card && this._card.id
    }

    isSaved(): boolean {
        return !!this.id();
    }

    publicUUID(): string {
        return this._card && this._card.public_uuid;
    }

    getUrl(): string {
        return "";
    }
    getLineage(): ?Question {
        return null;
    }

    getPublicUrl(): string {
        return "";
    }
    getDownloadURL(format: DownloadFormat): string {
        return "";
    }

    // These methods require integration with Redux actions or REST API
    update(): Promise<void> {
        return new Promise(() => {});
    }
    save(): Promise<void> {
        return new Promise(() => {});
    }
    revert(revisionId: RevisionId): Promise<void> {
        return new Promise(() => {});
    }
    enablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    disablePublicSharing(): Promise<void> {
        return new Promise(() => {});
    }
    publishAsEmbeddable(): Promise<void> {
        return new Promise(() => {});
    }
    getVersionHistory(): Promise<void> {
        return new Promise(() => {});
    }
    run(): Promise<void> {
        return new Promise(() => {});
    }

    parameters(): ParameterObject[] {
        return getParametersWithExtras(this.card(), this._parameterValues);
    }

    createParameter(parameter: ParameterOptions) {}
    updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    deleteParameter(id: ParameterId) {}
}
