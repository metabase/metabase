/* @flow */

import type { Field } from "./Field";

export type TableId = number;

// TODO: incomplete
export type Table = {
    id: TableId,

    fields: Array<Field>
};
