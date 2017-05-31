/* @flow weak */

import Question from "../Question";

import Base from "./Base";
import Table from "./Table";
import Schema from "./Schema";

import _ from "underscore";

import type { SchemaName } from "metabase/meta/types/Table";

/**
 * Wrapper class for database metadata objects. Contains {@link Schema}s, {@link Table}s, {@link Metric}s, {@link Segment}s.
 */
export default class Database extends Base {
    displayName: string;
    description: string;

    tables: Table[];
    schemas: Schema[];

    tablesInSchema(schemaName: ?SchemaName) {
        return this.tables.filter(table => table.schema === schemaName);
    }

    schemaNames(): Array<SchemaName> {
        return _.uniq(
            this.tables
                .map(table => table.schema)
                .filter(schemaName => schemaName != null)
        );
    }

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }
}
