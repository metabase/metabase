/* @flow weak */

import Database from "./metadata/Database";
import Table from "./metadata/Table";
import Metadata from "./metadata/Metadata";

import Question from "./Question";
import Action, { ActionClick } from "./Action";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type { DatabaseId, DatabaseEngine } from "metabase/meta/types/Database";

/**
 * This is a wrapper around a single MBQL or Native query
 */
export default class Query {
    _metadata: Metadata;
    _question: Question;
    _datasetQuery: DatasetQuery;
    _index: number;

    constructor(question: Question, index: number, datasetQuery: DatasetQuery) {
        this._metadata = question._metadata;
        this._question = question;
        this._index = index;
        this._datasetQuery = datasetQuery;
    }

    isStructured(): boolean {
        return false;
    }
    isNative(): boolean {
        return false;
    }

    question(): Question {
        return this._question.setQuery(this, this._index);
    }

    /**
     * Returns the dataset_query object underlying this Query
     */
    datasetQuery(): DatasetQuery {
        return this._datasetQuery;
    }

    /**
     * Databases this query could use
     */
    databases(): Database[] {
        return this._metadata.databasesList();
    }

    /** Tables this query could use, if the database is set
     */
    tables(): ?(Table[]) {
        const database = this.database();
        return (database && database.tables) || null;
    }

    databaseId(): ?DatabaseId {
        // same for both structured and native
        return this.datasetQuery().database;
    }
    database(): ?Database {
        const databaseId = this.databaseId();
        return databaseId != null ? this._metadata.databases[databaseId] : null;
    }
    engine(): ?DatabaseEngine {
        const database = this.database();
        return database && database.engine;
    }

    // NATIVE QUERY

    getNativeQuery(): string {
        // this requires the result dataset, or a call to the server
        return "";
    }
    convertToNativeQuery() {
        // this requires the result dataset, or a call to the server
    }

    /**
     * Top level actions that can be performed on this query
     */
    actions(): Action[] {
        return [];
    }

    /**
     * Drill through actions that can be performed on a part of the result setParameter
     */
    actionsForClick(click: ActionClick): Action[] {
        return [];
    }

    /**
     * Query is valid (as far as we know) and can be executed
     */
    canRun(): boolean {
        // TODO:
        return false;
    }

    setDatasetQuery(datasetQuery: DatasetQuery): Query {
        return this.question().createQuery(datasetQuery, this._index);
    }

    /**
     * Helper for updating with functions that expect a DatasetQuery
     */
    update(fn: (datasetQuery: DatasetQuery) => void) {
        return fn(this.datasetQuery());
    }
}
