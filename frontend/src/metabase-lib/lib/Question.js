/* @flow weak */

import Query from "./queries/Query";

import Metadata from "./metadata/Metadata";
import Table from "./metadata/Table";
import Field from "./metadata/Field";

import StructuredQuery, {
    STRUCTURED_QUERY_TEMPLATE
} from "./queries/StructuredQuery";
import NativeQuery from "./queries/NativeQuery";

import { memoize } from "metabase-lib/lib/utils";
import Utils from "metabase/lib/utils";
import * as Card_DEPRECATED from "metabase/lib/card";
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
import type {
    DatasetQuery,
    Card as CardObject
} from "metabase/meta/types/Card";

import type {
    ClickAction,
    ClickObject,
    QueryMode
} from "metabase/meta/types/Visualization";
import { MetabaseApi, CardApi } from "metabase/services";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

import type { Dataset } from "metabase/meta/types/Dataset";
import type { TableId } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";

// TODO: move these
type DownloadFormat = "csv" | "json" | "xlsx";
type RevisionId = number;
type ParameterOptions = "FIXME";

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
export default class Question {
    /**
     * The Question wrapper requires a metadata object because the queries it contains (like {@link StructuredQuery))
     * need metadata for accessing databases, tables and metrics.
     */
    _metadata: Metadata;

    /**
     * The plain object presentation of this question, equal to the format that Metabase REST API understands.
     * It is called `card` for both historical reasons and to make a clear distinction to this class.
     */
    _card: CardObject;

    /**
     * Parameter values mean either the current values of dashboard filters or SQL editor template parameters.
     * They are in the grey area between UI state and question state, but having them in Question wrapper is convenient.
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
     * TODO Atte Keinänen 6/13/17: Discussed with Tom that we could use the default Question constructor instead,
     * but it would require changing the constructor signature so that `card` is an optional parameter and has a default value
     */
    static create(
        {
            databaseId,
            tableId,
            metadata,
            parameterValues,
            ...cardProps
        }: {
            databaseId?: DatabaseId,
            tableId?: TableId,
            metadata: Metadata,
            parameterValues?: ParameterValues
        }
    ) {
        const card = {
            name: cardProps.name || null,
            display: cardProps.display || "table",
            visualization_settings: cardProps.visualization_settings || {},
            dataset_query: STRUCTURED_QUERY_TEMPLATE // temporary placeholder
        };

        // $FlowFixMe Passing an incomplete card object
        const initialQuestion = new Question(metadata, card, parameterValues);
        const query = StructuredQuery.newStucturedQuery({
            question: initialQuestion,
            databaseId,
            tableId
        });

        return initialQuestion.setQuery(query);
    }

    /**
     * A question contains either a:
     * - StructuredQuery for queries written in MBQL
     * - NativeQuery for queries written in data source's native query language
     *
     * This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type.
     */
    @memoize query(): Query {
        const datasetQuery = this._card.dataset_query;

        for (const QueryClass of [StructuredQuery, NativeQuery]) {
            if (QueryClass.isDatasetQueryType(datasetQuery)) {
                return new QueryClass(this, datasetQuery);
            }
        }

        throw new Error("Unknown query type: " + datasetQuery.type);
    }

    metadata(): Metadata {
        return this._metadata;
    }

    setCard(card: CardObject): Question {
        return new Question(this._metadata, card, this._parameterValues);
    }

    // TODO: Rename?
    newQuestion() {
        return this.setCard(
            chain(this.card())
                .dissoc("id")
                .dissoc("name")
                .dissoc("description")
                .value()
        );
    }

    isEmpty(): boolean {
        return this.query().isEmpty();
    }

    /**
     * Returns a new Question object with an updated query.
     * The query is saved to the `dataset_query` field of the Card object.
     */
    setQuery(newQuery: Query): Question {
        if (this._card.dataset_query !== newQuery.datasetQuery()) {
            return this.setCard(
                assoc(this.card(), "dataset_query", newQuery.datasetQuery())
            );
        }
        return this;
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
     * Returns a list of atomic queries (NativeQuery or StructuredQuery) contained in this question
     */
    atomicQueries(): AtomicQuery[] {
        const query = this.query();
        if (query instanceof AtomicQuery) return [query];
        return [];
    }

    /**
     * Visualization drill-through and action widget actions
     *
     * Although most of these are essentially a way to modify the current query, having them as a part
     * of Question interface instead of Query interface makes it more convenient to also change the current visualization
     */
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

    /**
     * Runs the query and returns an array containing results for each single query.
     *
     * If we have a saved and clean single-query question, we use `CardApi.query` instead of a ad-hoc dataset query.
     * This way we benefit from caching and query optimizations done by Metabase backend.
     */
    async getResults(
        { cancelDeferred, isDirty = false, ignoreCache = false } = {}
    ): Promise<[Dataset]> {
        const canUseCardApiEndpoint = !isDirty && this.isSaved();

        const parametersList = this.parametersList().map(param => _.pick(param, "target", "type", "value"));
        const hasParameters = parametersList.length > 0;

        if (canUseCardApiEndpoint) {
            const queryParams = {
                cardId: this.id(),
                ignore_cache: ignoreCache,
                ...(hasParameters ? { parameters: parametersList } : {})
            };

            return [
                await CardApi.query(queryParams, {
                    cancelled: cancelDeferred.promise
                })
            ];
        } else {
            const getDatasetQueryResult = datasetQuery => {
                const datasetQueryWithParameters = {
                    ...datasetQuery,
                    ...(hasParameters ? { parameters: parametersList } : {})
                }

                return MetabaseApi.dataset(
                    datasetQueryWithParameters,
                    cancelDeferred ? {cancelled: cancelDeferred.promise} : {}
                );
            }

            const datasetQueries = this.atomicQueries().map(query =>
                query.datasetQuery());
            return Promise.all(datasetQueries.map(getDatasetQueryResult));
        }
    }

    // TODO: Fix incorrect Flow signature
    parameters(): ParameterObject[] {
        return getParametersWithExtras(this.card(), this._parameterValues);
    }

    parametersList(): ParameterObject[] {
        return Object.values(this.parameters());
    }

    createParameter(parameter: ParameterOptions) {}
    updateParameter(id: ParameterId, parameter: ParameterOptions) {}
    deleteParameter(id: ParameterId) {}

    // predicate function that dermines if the question is "dirty" compared to the given question
    isDirtyComparedTo(originalQuestion: Question) {
        // TODO Atte Keinänen 6/8/17: Reconsider these rules because they don't completely match
        // the current implementation which uses original_card_id for indicating that question has a lineage

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

        return Card_DEPRECATED.utf8_to_b64url(JSON.stringify(cardCopy));
    }
}
