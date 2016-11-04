

import { mbqlEq } from "./util";

import type { Field } from "metabase/meta/types/Query";

// gets the target field ID (recursively) from any type of field, including raw field ID, fk->, and datetime_field cast.
export function getFieldTargetId(field: Field): ?FieldId {
    if (isRegularField(field)) {
        return field;
    } else if (isLocalField(field)) {
        // $FlowFixMe
        return field[1];
    } else if (isForeignKeyField(field)) {
        // $FlowFixMe
        return getFieldTargetId(field[2]);
    } else if (isDatetimeField(field)) {
        // $FlowFixMe
        return getFieldTargetId(field[1]);
    }
    console.warn("Unknown field type: ", field);
}

export function isRegularField(field: Field): boolean {
    return typeof field === "number";
}

export function isLocalField(field: Field): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "field-id");
}

export function isForeignKeyField(field: Field): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "fk->");
}

export function isDatetimeField(field: Field): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "datetime-field");
}

export function isExpressionField(field: Field): boolean {
    return Array.isArray(field) && field.length === 2 && mbqlEq(field[0], "expression");
}

export function isAggregateField(field: Field): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "aggregation");
}
