/* @flow */

export type FieldId = number;

// TODO: incomplete
export type Field = {
    id: FieldId,

    // https://github.com/metabase/metabase/issues/3417
    values: Array<string> | { values: Array<string> }
};
