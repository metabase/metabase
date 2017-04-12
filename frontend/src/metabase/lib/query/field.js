
import { mbqlEq } from "./util";

import type { Field as FieldReference } from "metabase/meta/types/Query";
import type { Field, FieldId } from "metabase/meta/types/Field";

// gets the target field ID (recursively) from any type of field, including raw field ID, fk->, and datetime-field cast.
export function getFieldTargetId(field: FieldReference): ?FieldId {
    if (isRegularField(field)) {
        // $FlowFixMe
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

export function isRegularField(field: FieldReference): boolean {
    return typeof field === "number";
}

export function isLocalField(field: FieldReference): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "field-id");
}

export function isForeignKeyField(field: FieldReference): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "fk->");
}

export function isDatetimeField(field: FieldReference): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "datetime-field");
}

export function isExpressionField(field: FieldReference): boolean {
    return Array.isArray(field) && field.length === 2 && mbqlEq(field[0], "expression");
}

export function isAggregateField(field: FieldReference): boolean {
    return Array.isArray(field) && mbqlEq(field[0], "aggregation");
}

// Metadata field "values" type is inconsistent
// https://github.com/metabase/metabase/issues/3417
export function getFieldValues(field: ?Field): any[] {
    const values = field && field.values;
    if (Array.isArray(values)) {
        return values;
    } else if (values && Array.isArray(values.values)) {
        return values.values;
    } else {
        return [];
    }
}
