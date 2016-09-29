/* @flow */

import type { Table } from "./Table";

export type DatabaseId = number;

// TODO: incomplete
export type Database = {
    id: DatabaseId,

    tables: Array<Table>
};
