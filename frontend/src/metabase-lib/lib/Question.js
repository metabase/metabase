/* @flow weak */

import Query from "./Query";
import Dimension from "./Dimension";

import Metadata from "./metadata/Metadata";
import Metric from "./metadata/Metric";
import Table from "./metadata/Table";
import Field from "./metadata/Field";

import Breakout from "./query/Breakout";
import Filter from "./query/Filter";

import StructuredQuery from "./StructuredQuery";
import NativeQuery from "./NativeQuery";

import * as Q from "metabase/lib/query/query";
import { getParametersWithExtras } from "metabase/meta/Card";

import _ from "underscore";

import {
    summarize,
    pivot,
    filter,
    breakout,
    toUnderlyingRecords,
    drillUnderlyingRecords
} from "metabase/qb/lib/actions";
import { getMode } from "metabase/qb/lib/modes";

import { chain, updateIn } from "icepick";

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

import type {
    ClickAction,
    ClickObject,
    QueryMode
} from "metabase/meta/types/Visualization";

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

    metadata(): Metadata {
        return this._metadata;
    }

    setCard(card: CardObject): Question {
        return new Question(this._metadata, card, this._parameterValues);
    }

    display() {
        return this._card.display;
    }

    setDisplay(display): Question {
        return this.setCard({
            ...this.card(),
            display
        });
    }

    newQuestion() {
        return this.setCard(
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

    setQuery(newQuery: Query, index?: number): Question {
        if (index != null && newQuery instanceof StructuredQuery) {
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
            return this.setCard({
                ...this._card,
                dataset_query: {
                    ...newQuery.datasetQuery(),
                    query: query
                }
            });
        } else {
            return this.setCard({
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

    isSaved(): boolean {
        return this.card().id != null;
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
        return this.setCard(
            updateIn(this.card(), ["dataset_query", "query"], query =>
                Q.addAggregation(
                    query,
                    Q.getAggregations(datasetQuery.query)[0]
                ))
        );
    }
    updateMetric(index: number, metric: Query): Question {
        return this.setQuery(metric, index);
    }
    removeMetric(index: number): Question {
        // TODO: multiple metrics persistence
        return this.setCard(
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

    // drill through / actions
    // TODO: a lot of this should be moved to StructuredQuery?

    summarize(aggregation) {
        const tableMetadata = this.tableMetadata();
        return this.setCard(summarize(this.card(), aggregation, tableMetadata));
    }
    breakout(b) {
        return this.setCard(breakout(this.card(), b));
    }
    pivot(breakout, dimensions = []) {
        const tableMetadata = this.tableMetadata();
        return this.setCard(
            // $FlowFixMe: tableMetadata could be null
            pivot(this.card(), breakout, tableMetadata, dimensions)
        );
    }
    filter(operator, column, value) {
        return this.setCard(filter(this.card(), operator, column, value));
    }
    drillUnderlyingRecords(dimensions) {
        return this.setCard(drillUnderlyingRecords(this.card(), dimensions));
    }
    toUnderlyingRecords(): ?Question {
        const newCard = toUnderlyingRecords(this.card());
        if (newCard) {
            return this.setCard(newCard);
        }
    }
    toUnderlyingData(): Question {
        return this.setDisplay("table");
    }
    drillPK(field: Field, value: Value): ?Question {
        const query = this.query();
        if (query instanceof StructuredQuery) {
            return query
                .reset()
                .setTable(field.table)
                .addFilter(["=", ["field-id", field.id], value])
                .question();
        }
    }

    // deprecated
    tableMetadata(): ?Table {
        const query = this.query();
        if (query instanceof StructuredQuery) {
            return query.table();
        } else {
            return null;
        }
    }

    mode(): ?QueryMode {
        return getMode(this.card(), this.tableMetadata());
    }

    actions(): ClickAction[] {
        const mode = this.mode();
        if (mode) {
            return _.flatten(
                mode.actions.map(actionCreator =>
                    actionCreator({ question: this }))
            );
        } else {
            return [];
        }
    }

    actionsForClick(clicked: ?ClickObject): ClickAction[] {
        const mode = this.mode();
        if (mode) {
            return _.flatten(
                mode.drills.map(actionCreator =>
                    actionCreator({ question: this, clicked }))
            );
        } else {
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

    parameters(): ParameterObject[] {
        return getParametersWithExtras(this.card(), this._parameterValues);
    }

    createParameter(parameter: ParameterOptions) {}
    updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    deleteParameter(id: ParameterId) {}
}
