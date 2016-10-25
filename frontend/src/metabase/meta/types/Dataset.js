/* @flow */

export type Timestamp = string;

export type ColumnName = string;

// TODO: incomplete
export type Column = {
    name: ColumnName,
    display_name: string,
    base_type: string,
}

export type Row = Array<string|number|Timestamp>

export type Dataset = {
    data: {
        cols: Column[],
        columns: ColumnName[],
        rows: Row[]
    }
}
