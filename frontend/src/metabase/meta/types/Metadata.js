/* @flow */

// Legacy "tableMetadata" etc

import type { Table } from "metabase/meta/types/Table";
import type { Field } from "metabase/meta/types/Field";
import type { Segment } from "metabase/meta/types/Segment";
import type { Metric } from "metabase/meta/types/Metric";

export type FieldValue = {
    name: string,
    key: string
}

export type OperatorName = string;

export type Operator = {
    name: OperatorName,
    verboseName: string,
    moreVerboseName: string,
    fields: OperatorField[],
    multi: bool,
    advanced: bool,
    placeholders?: string[],
    validArgumentsFilters: ValidArgumentsFilter[],
}

export type OperatorField = {
    type: string,
    values: FieldValue[]
}

export type ValidArgumentsFilter = (field: Field, table: Table) => bool;

export type FieldMetadata = Field & {
    operators_lookup: { [name: string]: Operator }
}

export type AggregationOption = {
    name: string,
    short: string,
    fields: Field[],
    validFieldsFilter: (fields: Field[]) => Field[]
}

export type BreakoutOptions = {
    name: string,
    short: string,
    fields: Field[],
    validFieldsFilter: (fields: Field[]) => Field[]
}

export type TableMetadata = Table & {
    fields: FieldMetadata[],
    segments: Segment[],
    metrics: Metric[],
    aggregation_options: AggregationOption[],
    breakout_options: BreakoutOptions
}

export type FieldOptions = {
    count: number,
    fields: Field[],
    fks: {
        field: Field,
        fields: Field[]
    }
};
