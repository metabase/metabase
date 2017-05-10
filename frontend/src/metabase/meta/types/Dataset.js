/* @flow */

import type { ISO8601Time } from ".";
import type { FieldId } from "./Field";
import type { DatasetQuery } from "./Card";
import type { DatetimeUnit } from "./Query";

export type ColumnName = string;

// TODO: incomplete
export type Column = {
    id: ?FieldId,
    name: ColumnName,
    display_name: string,
    base_type: string,
    special_type: ?string,
    source?: "fields"|"aggregation"|"breakout",
    unit?: DatetimeUnit
};

export type Value = string|number|ISO8601Time|boolean|null|{};
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
