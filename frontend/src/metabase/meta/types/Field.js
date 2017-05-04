/* @flow */

import type { ISO8601Time } from ".";
import type { TableId } from "./Table";

export type FieldId = number;

export type BaseType = string;
export type SpecialType = string;

export type FieldVisibilityType = "details-only" | "hidden" | "normal" | "retired";

export type Field = {
    id:                 FieldId,

    name:               string,
    display_name:       string,
    description:        string,
    base_type:          BaseType,
    special_type:       SpecialType,
    active:             boolean,
    visibility_type:    FieldVisibilityType,
    preview_display:    boolean,
    position:           number,
    parent_id:          ?FieldId,

    // raw_column_id:   number // unused?

    table_id:           TableId,

    fk_target_field_id: ?FieldId,

    max_value:          ?number,
    min_value:          ?number,

    caveats:            ?string,
    points_of_interest: ?string,

    last_analyzed:      ISO8601Time,
    created_at:         ISO8601Time,
    updated_at:         ISO8601Time,

    // Metadata field "values" type is inconsistent
    // https://github.com/metabase/metabase/issues/3417
    values: [] | FieldValues
};

export type FieldValues = {
    // incomplete
    values: Array<string> | {}
}
