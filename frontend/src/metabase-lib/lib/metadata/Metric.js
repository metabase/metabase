/* @flow weak */

import Base from "./Base";
import Question from "../Question";
import Database from "./Database";
import Table from "./Table";
import type { Aggregation } from "metabase/meta/types/Query";

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Metric extends Base {
    displayName: string;
    description: string;

    database: Database;
    table: Table;

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }

    aggregationClause(): Aggregation {
        return ["METRIC", this.id];
    }
}
