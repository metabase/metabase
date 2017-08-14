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

import _ from "underscore";
import { chain, assoc } from "icepick";

import type {
    Parameter as ParameterObject,
    ParameterValues
} from "metabase/meta/types/Parameter";
import type {
    DatasetQuery,
    Card as CardObject
} from "metabase/meta/types/Card";

import { MetabaseApi, CardApi } from "metabase/services";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

import type { Dataset } from "metabase/meta/types/Dataset";
import type { TableId } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";
import * as Urls from "metabase/lib/urls";
import Mode from "metabase-lib/lib/Mode";

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
        // $FlowFixMe
        const card: Card = {
            name: cardProps.name || null,
            display: cardProps.display || "table",
            visualization_settings: cardProps.visualization_settings || {},
            dataset_query: STRUCTURED_QUERY_TEMPLATE // temporary placeholder
        };

        const initialQuestion = new Question(metadata, card, parameterValues);
        const query = StructuredQuery.newStucturedQuery({
            question: initialQuestion,
            databaseId,
            tableId
        });

        return initialQuestion.setQuery(query);
    }

    metadata(): Metadata {
        return this._metadata;
    }

    card() {
        return this._card;
    }
    setCard(card: CardObject): Question {
        return new Question(this._metadata, card, this._parameterValues);
    }

    withoutNameAndId() {
        return this.setCard(
            chain(this.card())
                .dissoc("id")
                .dissoc("name")
                .dissoc("description")
                .value()
        );
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

    /**
     * Returns a list of atomic queries (NativeQuery or StructuredQuery) contained in this question
     */
    atomicQueries(): AtomicQuery[] {
        const query = this.query();
        if (query instanceof AtomicQuery) return [query];
        return [];
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

    isEmpty(): boolean {
        return this.query().isEmpty();
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
    pivot(breakouts = [], dimensions = []) {
        const tableMetadata = this.tableMetadata();
        return this.setCard(
            // $FlowFixMe: tableMetadata could be null
            pivot(this.card(), tableMetadata, breakouts, dimensions)
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

    composeThisQuery(): ?Question {
        const SAVED_QUESTIONS_FAUX_DATABASE = -1337;

        if (this.id()) {
            const card = {
                display: "table",
                dataset_query: {
                    type: "query",
                    database: SAVED_QUESTIONS_FAUX_DATABASE,
                    query: {
                        source_table: "card__" + this.id()
                    }
                }
            };
            return this.setCard(card);
        }
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

    mode(): ?Mode {
        return Mode.forQuestion(this);
    }

    /**
     * A user-defined name for the question
     */
    displayName(): ?string {
        return this._card && this._card.name;
    }

    setDisplayName(name: String) {
        return this.setCard(assoc(this.card(), "name", name));
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

    getUrl(originalQuestion?: Question): string {
        const isDirty = !originalQuestion ||
            this.isDirtyComparedTo(originalQuestion);

        return isDirty
            ? Urls.question(null, this._serializeForUrl())
            : Urls.question(this.id(), "");
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
        // TODO Atte Keinänen 7/5/17: Should we clean this query with Query.cleanQuery(query) before executing it?

        const canUseCardApiEndpoint = !isDirty && this.isSaved();

        const parameters = this.parametersList()
            // include only parameters that have a value applied
            .filter(param => _.has(param, "value"))
            // only the superset of parameters object that API expects
            .map(param => _.pick(param, "type", "target", "value"));

        if (canUseCardApiEndpoint) {
            const queryParams = {
                cardId: this.id(),
                ignore_cache: ignoreCache,
                parameters
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
                    parameters
                };

                return MetabaseApi.dataset(
                    datasetQueryWithParameters,
                    cancelDeferred ? { cancelled: cancelDeferred.promise } : {}
                );
            };

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
        // $FlowFixMe
        return (Object.values(this.parameters()): ParameterObject[]);
    }

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
            const origCardSerialized = originalQuestion._serializeForUrl({
                includeOriginalCardId: false
            });
            const currentCardSerialized = this._serializeForUrl({
                includeOriginalCardId: false
            });
            return currentCardSerialized !== origCardSerialized;
        }
    }

    // Internal methods

    _serializeForUrl({ includeOriginalCardId = true } = {}) {
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
                ? { original_card_id: this._card.original_card_id }
                : {})
        };

        return Card_DEPRECATED.utf8_to_b64url(JSON.stringify(cardCopy));
    }
}
