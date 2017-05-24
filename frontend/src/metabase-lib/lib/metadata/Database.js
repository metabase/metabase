/* @flow */

import Question from "../Question";

import Base from "./Base";
import Table from "./Table";
import Schema from "./Schema";

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 */
export default class Database extends Base {
    displayName: string;
    description: string;

    tables: Table[];
    schemas: Schema[];

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }
}
