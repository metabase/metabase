/* @flow */

import Database from "./metadata/Database";
import Table from "./metadata/Table";

import Question from "./Question";
import Action, { ActionClick } from "./Action";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type { Metadata as MetadataObject } from "metabase/meta/types/Metadata";

import Dimension from "metabase-lib/lib/Dimension";

/**
 * This is a wrapper around a single MBQL or Native query
 */
export default class Query {
    _metadata: MetadataObject;
    _question: Question;
    _datasetQuery: DatasetQuery;

    constructor(question: Question, datasetQuery: DatasetQuery) {
        this._metadata = question._metadata;
        this._question = question;
        this._datasetQuery = datasetQuery;
    }

    isStructured(): boolean {
        return false;
    }
    isNative(): boolean {
        return false;
    }

    // datasetQuery
    datasetQuery(): DatasetQuery {
        return this._datasetQuery;
    }

    dimensions(): Dimension[] {
        return [];
    }


    setDatabase(database: Database) {}

    setTable(table: Table) {}

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

    update(fn: (datasetQuery: DatasetQuery) => void) {
        return fn(this.datasetQuery());
    }
}
