/* @flow */

export type TableId = number;
export type SchemaName = string;

export type Table = {
    id: TableId,
    name: string,
    display_name: string,
    schema?: SchemaName
}
