/* @flow weak */

import Question from "../Question";

import Base from "./Base";
import Database from "./Database";
import Field from "./Field";

import type { SchemaName } from "metabase/meta/types/Table";

import Dimension from "../Dimension";

//** This is the primary way people interact with tables */
export default class Table extends Base {
    displayName: string;
    description: string;

    schema: SchemaName;
    database: Database;

    fields: Field[];

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }

    dimensions(): Dimension[] {
        return this.fields.map(field => field.dimension());
    }
}
