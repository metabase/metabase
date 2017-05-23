/* @flow */

import Question from "../Question";

import Database from "./Database";
import Schema from "./Schema";
import Field from "./Field";

//** This is the primary way people interact with tables */
export default class Table {
    displayName: string;
    description: string;

    schema: Schema;
    database: Database;

    fields: Field[];

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }
}
