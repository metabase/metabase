/* @flow weak */

import Query from "./Query";
import Dimension from "./Dimension";

import Metadata from "./metadata/Metadata";
import Metric from "./metadata/Metric";
import Table from "./metadata/Table";
import Field from "./metadata/Field";

import Breakout from "./query/Breakout";
import Filter from "./query/Filter";

import MultiQuery, { isMultiDatasetQuery, convertToMultiDatasetQuery } from "./MultiQuery";
import StructuredQuery, { isStructuredDatasetQuery } from "metabase-lib/lib/StructuredQuery";
import NativeQuery, { isNativeDatasetQuery } from "metabase-lib/lib/NativeQuery";

import { memoize } from "metabase-lib/lib/utils";
import Utils from "metabase/lib/utils";
import { utf8_to_b64url } from "metabase/lib/card";
import Query_DEPRECATED from "metabase/lib/query";

import { getParametersWithExtras } from "metabase/meta/Card";

import {
    summarize,
    pivot,
    filter,
    breakout,
    toUnderlyingRecords,
    drillUnderlyingRecords
} from "metabase/qb/lib/actions";
import { getMode } from "metabase/qb/lib/modes";

import _ from "underscore";
import { chain, assoc } from "icepick";

import type {
    Parameter as ParameterObject,
    ParameterId,
    ParameterValues
} from "metabase/meta/types/Parameter";
import type { DimensionOptions } from "metabase/meta/types/Metadata";
import type {
    DatasetQuery,
    Card as CardObject,
    StructuredDatasetQuery as StructuredDatasetQueryObject
} from "metabase/meta/types/Card";

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
    /**
     * A Question wrapper requires
     * TODO Atte Keinänen 6/6/17: Check which parts of metadata are actually needed and document them here
     * The contents of `metadata` could also be asserted in the Question constructor
     */
    _metadata: Metadata;

    /**
     * The plain object presentation of this question, equal to the format that Metabase REST API understands.
     * It is called `card` for both historical reasons and to make a clear distinction to this class.
     */
    _card: CardObject;

    /**
     * Parameter values mean either the current values of dashboard filters or SQL editor template parameters.
     * TODO Atte Keinänen 6/6/17: Why are parameter values considered a part of a Question?
     */
    _parameterValues: ParameterValues;

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
    }

    /**
     * A question contains either a:
     * - StructuredQuery for queries written in MBQL
     * - NativeQuery for queries written in data source's native query language
     * - MultiQuery that is composed from one or more structured or native queries
     *
     * This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type.
     */
    @memoize query(): Query {
        const datasetQuery = this._card.dataset_query;

        if (isMultiDatasetQuery(datasetQuery)) {
            return new MultiQuery(this, datasetQuery);
        } else if (isStructuredDatasetQuery(datasetQuery)) {
            return new StructuredQuery(this, datasetQuery);
        } else if (isNativeDatasetQuery(datasetQuery)) {
            return new NativeQuery(this, datasetQuery);
        }

        throw new Error("Unknown query type: " + datasetQuery.type);
    }

    metadata(): Metadata {
        return this._metadata;
    }

    setCard(card: CardObject): Question {
        return new Question(this._metadata, card, this._parameterValues);
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

    /**
     * Returns a new Question object with an updated query.
     * The query is saved to the `dataset_query` field of the Card object.
     */
    setQuery(newQuery: Query): Question {
        return this.setCard(
            assoc(this.card(), "dataset_query", newQuery.datasetQuery())
        );
    }

    setDatasetQuery(newDatasetQuery: DatasetQuery): Question {
        return this.setCard(
            assoc(this.card(), "dataset_query", newDatasetQuery)
        );
    }

    card() {
        return this._card;
    }

    /**
     * The visualization type of the question
     */
    display(): string {
        return this._card && this._card.display;
    }

    setDisplay(display) {
        return this.setCard(assoc(this.card(), "display", display));
    }

    /**
     * Question is valid (as far as we know) and can be executed
     */
    canRun(): boolean {
        return this.query().canRun();
    }

    canWrite(): boolean {
        return this._card && this._card.can_write;
    }


    /**
     * Conversion from a single query -centric question to a multi-query question
     */
    isMultiQuery(): boolean {
        return this.query().isMulti();
    }
    canConvertToMultiQuery(): boolean {
        return true;
    }
    convertToMultiQuery(): Question {
        // TODO Atte Keinänen 6/6/17: I want to be 99% sure that this doesn't corrupt the question in any scenario
        const multiDatasetQuery = convertToMultiDatasetQuery(this._card.dataset_query);
        return this.setCard(assoc(this._card, "dataset_query", multiDatasetQuery));
    }

    /**
     * Returns a list of atomic queries (NativeQuery or StructuredQuery) contained in this question
     */
    singleQueries(): Query[] {
        return this.query().isMulti() ? this.query().childQueries() : [this.query()];
    }

    /**
     * Metric-related methods for the multi-metric query builder
     *
     * These methods provide convenient abstractions and mental mappings for working with questions
     * which are composed of different kinds of metrics (either reusable saved metrics or ad-hoc metrics that are
     * specific to the current question)
     */
    assertIsMultiQuery(): void {
        if (!this.isMultiQuery()) {
            throw new Error("Trying to use a metric method for a Question that hasn't been converted to a multi-query format")
        }
    }

    availableSavedMetrics(): Metric[] {
        this.assertIsMultiQuery();
        return this._metadata.metricsList();
    }
    canAddMetric(): boolean {
        this.assertIsMultiQuery();
        // $FlowFixMe
        const multiQuery: MultiQuery = this.query();
        return multiQuery.canAddQuery();
    }
    canRemoveMetric(): boolean {
        this.assertIsMultiQuery();
        // can't remove last metric
        // $FlowFixMe
        const multiQuery: MultiQuery = this.query();
        return multiQuery.childQueries().length > 1;
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
        this.assertIsMultiQuery();
        // $FlowFixMe
        const multiQuery: MultiQuery = this.query();
        return this.setQuery(multiQuery.addQuery(datasetQuery))
    }
    updateMetric(index: number, metric: Query): Question {
        this.assertIsMultiQuery();
        // $FlowFixMe
        const multiQuery: MultiQuery = this.query();
        return this.setQuery(multiQuery.setQueryAtIndex(index, metric))
    }
    removeMetric(index: number): Question {
        this.assertIsMultiQuery();
        // $FlowFixMe
        const multiQuery: MultiQuery = this.query();
        return this.setQuery(multiQuery.removeQueryAtIndex(index))
    }

    // multiple series can be pivoted
    // $FlowFixMe
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

    /**
     * A user-defined name for the question
     */
    displayName(): ?string {
        return this._card && this._card.name;
    }

    id(): number {
        return this._card && this._card.id;
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

    // predicate function that dermines if the question is "dirty" compared to the given question
    isDirtyComparedTo(originalQuestion: Question) {
        // The rules:
        //   - if it's new, then it's dirty when
        //       1) there is a database/table chosen or
        //       2) when there is any content on the native query
        //   - if it's saved, then it's dirty when
        //       1) the current card doesn't match the last saved version

        if (!this._card) {
            return false;
        } else if (!this._card.id) {
            if (
                this._card.dataset_query.query &&
                this._card.dataset_query.query.source_table
            ) {
                return true;
            } else if (
                this._card.dataset_query.type === "native" &&
                !_.isEmpty(this._card.dataset_query.native.query)
            ) {
                return true;
            } else {
                return false;
            }
        } else {
            const origCardSerialized = originalQuestion.serializeForUrl();
            const currentCardSerialized = this.serializeForUrl({
                includeOriginalCardId: false
            });
            return currentCardSerialized !== origCardSerialized;
        }
    }

    serializeForUrl({ includeOriginalCardId = true } = {}) {
        // TODO Atte Keinänen 5/31/17: Remove code mutation and unnecessary copying
        const dataset_query = Utils.copy(this._card.dataset_query);
        if (dataset_query.query) {
            dataset_query.query = Query_DEPRECATED.cleanQuery(
                dataset_query.query
            );
        }

        const cardCopy = {
            name: this._card.name,
            description: this._card.description,
            dataset_query: dataset_query,
            display: this._card.display,
            parameters: this._card.parameters,
            visualization_settings: this._card.visualization_settings,
            ...(includeOriginalCardId
                ? // $FlowFixMe
                  { original_card_id: this._card.original_card_id }
                : {})
        };

        return utf8_to_b64url(JSON.stringify(cardCopy));
    }
}
