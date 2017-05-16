/* @flow */

import Question from "../Question";

import Table from "./Table";
import Schema from "./Schema";

import { nyi } from "../utils";

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 */
export default class Database {
    displayName: string;
    description: string;

    tables: Table[];
    schemas: Schema[];

    @nyi newQuestion(): Question {
        return new Question();
    }
}
