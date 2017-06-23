/* @flow */

import type { ISO8601Time } from ".";

import type { Field, FieldId } from "./Field";
import type { Segment } from "./Segment";
import type { Metric } from "./Metric";
import type { DatabaseId } from "./Database";

export type TableId = number;
export type SchemaName = string;

type TableVisibilityType = string; // FIXME

type FieldValue = any;
type FieldValues = {
    [id: FieldId]: FieldValue[]
}

// TODO: incomplete
export type Table = {
    id:                      TableId,
    db_id:                   DatabaseId,

    schema:                  ?string,
    name:                    string,
    display_name:            string,

    description:             string,
    active:                  boolean,
    visibility_type:         TableVisibilityType,

    // entity_name:          null // unused?
    // entity_type:          null // unused?
    // raw_table_id:         number, // unused?

    fields:                  Field[],
    segments:                Segment[],
    metrics:                 Metric[],

    field_values:            FieldValues,

    rows:                    number,

    caveats:                 ?string,
    points_of_interest:      ?string,
    show_in_getting_started: boolean,

    updated_at:              ISO8601Time,
    created_at:              ISO8601Time,
}
