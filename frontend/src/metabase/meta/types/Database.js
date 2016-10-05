/* @flow */

import type { Table } from "./Table";

export type DatabaseId = number;

export type Database = {
    id: DatabaseId,
    name: string,
    tables: Array<Table>
};
