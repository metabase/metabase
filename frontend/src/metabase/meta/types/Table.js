/* @flow */

import type { Field } from "./Field";

export type TableId = number;
export type SchemaName = string;

// TODO: incomplete
export type Table = {
    id: TableId,

    name: string,
    display_name: string,
    schema?: SchemaName,

    fields: Array<Field>
}
