/* @flow */

import Database from "./Database";
import Table from "./Table";

/**
 * Wrapper class for a {@link Database} schema. Contains {@link Table}s.
 */
export default class Schema {
    displayName: string;

    database: Database;
    tables: Table[];
}
