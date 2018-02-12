/* @flow weak */

import Base from "./Base";
import Table from "./Table";

import { FieldIDDimension } from "../Dimension";

import { getFieldValues } from "metabase/lib/query/field";
import {
    isDate,
    isTime,
    isNumber,
    isNumeric,
    isBoolean,
    isString,
    isSummable,
    isCategory,
    isDimension,
    isMetric,
    isPK,
    isFK,
    isCoordinate,
    getIconForField,
    getFieldType
} from "metabase/lib/schema_metadata";

import type { FieldValues } from "metabase/meta/types/Field";

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */
export default class Field extends Base {
    displayName: string;
    description: string;

    table: Table;

    fieldType() {
        return getFieldType(this);
    }

    isDate() {
        return isDate(this);
    }
    isTime() {
        return isTime(this);
    }
    isNumber() {
        return isNumber(this);
    }
    isNumeric() {
        return isNumeric(this);
    }
    isBoolean() {
        return isBoolean(this);
    }
    isString() {
        return isString(this);
    }
    isSummable() {
        return isSummable(this);
    }
    isCategory() {
        return isCategory(this);
    }
    isMetric() {
        return isMetric(this);
    }

    isCompatibleWith(field: Field) {
        return this.isDate() === field.isDate() ||
            this.isNumeric() === field.isNumeric() ||
            this.id === field.id;
    }

    /**
     * Tells if this column can be used in a breakout
     * Currently returns `true` for everything expect for aggregation columns
     */
    isDimension() {
        return isDimension(this);
    }
    isID() {
        return isPK(this) || isFK(this);
    }
    isPK() {
        return isPK(this);
    }
    isFK() {
        return isFK(this);
    }

    isCoordinate() {
        return isCoordinate(this);
    }

    fieldValues(): FieldValues {
        return getFieldValues(this._object);
    }

    icon() {
        return getIconForField(this);
    }

    dimension() {
        return new FieldIDDimension(null, [this.id], this.metadata);
    }

    operator(op) {
        if (this.operators_lookup) {
            return this.operators_lookup[op];
        }
    }

    /**
     * Returns a default breakout MBQL clause for this field
     *
     * Tries to look up a default subdimension (like "Created At: Day" for "Created At" field)
     * and if it isn't found, uses the plain field id dimension (like "Product ID") as a fallback.
     */
    getDefaultBreakout = () => {
        const fieldIdDimension = this.dimension();
        const defaultSubDimension = fieldIdDimension.defaultDimension();
        if (defaultSubDimension) {
            return defaultSubDimension.mbql();
        } else {
            return fieldIdDimension.mbql();
        }
    };
}
