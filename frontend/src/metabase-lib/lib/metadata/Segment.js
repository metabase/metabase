/* @flow weak */

import Base from "./Base";
import Question from "../Question";
import Database from "./Database";
import Table from "./Table";

/**
 * Wrapper class for a segment. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Segment extends Base {
    displayName: string;
    description: string;

    database: Database;
    table: Table;

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }
}
