/* @flow */

import Query from "./Query";
import Dimension from "./Dimension";
import Parameter from "./Parameter";

import Breakout from "./query/Breakout";
import Filter from "./query/Filter";

import Action, { ActionClick } from "./Action";

import type { ParameterId } from "metabase/meta/types/Parameter";
import type { Metadata as MetadataObject } from "metabase/meta/types/Metadata";
import type { Card as CardObject } from "metabase/meta/types/Card";

import * as Q from "metabase/lib/query/query";

import { updateIn } from "icepick";

// TODO: move these
type DownloadFormat = "csv" | "json" | "xlsx";
type RevisionId = number;
type ParameterOptions = "FIXME";

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
export default class Question {
    _metadata: MetadataObject;
    _card: CardObject;

    /**
     * A question has one or more queries
     */
    _queries: Query[];

    /**
     * Question constructor
     */
    constructor(metadata: MetadataObject, card: CardObject) {
        this._metadata = metadata;
        this._card = card;
        const aggregations = Q.getAggregations(card.dataset_query.query);
        if (aggregations.length > 1) {
            // TODO: real multiple metric persistence
            this._queries = aggregations.map(
                aggregation =>
                    new Query(this, {
                        ...card.dataset_query,
                        query: Q.addAggregation(
                            Q.clearAggregations(card.dataset_query.query),
                            aggregation
                        )
                    })
            );
        } else {
            this._queries = [new Query(this, card.dataset_query)];
        }
    }

    updateQuery(index: number, newQuery: Query): Question {
        // TODO: real multiple metric persistence
        let query = Q.clearAggregations(newQuery.query());
        for (let i = 0; i < this._queries.length; i++) {
            query = Q.addAggregation(
                query,
                (i === index ? newQuery : this._queries[i]).aggregations()[0]
            );
        }
        return new Question(this._metadata, {
            ...this._card,
            dataset_query: {
                ...newQuery.datasetQuery(),
                query: query
            }
        });
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

    metrics(): Query[] {
        return this._queries;
    }
    availableMetrics(): MetricMetadata[] {
        return Object.values(this._metadata.metrics);
    }
    canAddMetric(): boolean {
        // only structured queries with 0 or 1 breakouts can have multiple series
        return this.query().isStructured() &&
            this.query().breakouts().length <= 1;
    }
    canRemoveMetric(): boolean {
        // can't remove last metric
        return this.metrics().length > 1;
    }

    addSavedMetric(metric: Metric): Question {
        return this.addMetric({
            type: "query",
            database: metric.table.db.id,
            query: {
                aggregation: ["METRIC", metric.id]
            }
        });
    }
    addMetric(datasetQuery: DatasetQuery): Question {
        // TODO: multiple metrics persistence
        return new Question(
            this._metadata,
            updateIn(this.card(), ["dataset_query", "query"], query =>
                Q.addAggregation(
                    query,
                    Q.getAggregations(datasetQuery.query)[0]
                ))
        );
    }
    removeMetric(index: number): Question {
        // TODO: multiple metrics persistence
        return new Question(
            this._metadata,
            updateIn(this.card(), ["dataset_query", "query"], query =>
                Q.removeAggregation(query, index))
        );
    }

    // multiple series can be pivoted
    breakouts(): Breakout[] {
        // TODO: real multiple metric persistence
        return this.query().breakouts();
    }
    breakoutDimensions(unused: boolean = false): Dimension[] {
        // TODO: real multiple metric persistence
        return this.query().breakoutDimensions();
    }
    canAddBreakout(): boolean {
        return this.breakouts() === 0;
    }

    // multiple series can be filtered by shared dimensions
    filters(): Filter[] {
        // TODO: real multiple metric persistence
        return this.query().filters();
    }
    filterOptions(): Dimension[] {
        // TODO: real multiple metric persistence
        return this.query().filterOptions();
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

    // Information
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

    parameters(): Parameter[] {
        return [];
    }
    editableParameters(): Parameter[] {
        return [];
    }

    createParameter(parameter: ParameterOptions) {}
    updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    deleteParameter(id: ParameterId) {}
}
