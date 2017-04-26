/* @flow */

export type FieldId = number;

// TODO: incomplete
export type Field = {
    id: FieldId,

    // Metadata field "values" type is inconsistent
    // https://github.com/metabase/metabase/issues/3417
    values: [] | FieldValues
};

export type FieldValues = {
    // incomplete
    values: Array<string> | {}
}
