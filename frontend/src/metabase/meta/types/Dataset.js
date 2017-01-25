/* @flow */

import type { FieldId } from "./Field";
import type { DatasetQuery } from "./Card";

export type ColumnName = string;

// TODO: incomplete
export type Column = {
    id: ?FieldId,
    name: ColumnName,
    display_name: string,
    base_type: string,
    special_type: ?string
};

export type ISO8601Times = string;
export type Value = string|number|ISO8601Times|boolean|null|{};
export type Row = Value[];

export type DatasetData = {
    cols: Column[],
    columns: ColumnName[],
    rows: Row[]
};

export type Dataset = {
    data: DatasetData,
    json_query: DatasetQuery
};
