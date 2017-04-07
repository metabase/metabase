/* @flow */

import type { Field } from "./Field";
import type { DatabaseId } from "./Database";

export type TableId = number;
export type SchemaName = string;

// TODO: incomplete
export type Table = {
    id: TableId,

    db_id: DatabaseId,

    name: string,
    display_name: string,
    schema?: SchemaName,

    fields: Array<Field>
}
