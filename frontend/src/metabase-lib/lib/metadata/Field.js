/* @flow */

import Base from "./Base";
import Table from "./Table";

import { FieldDimension } from "../Dimension";

import {
    isDate,
    isNumeric,
    isBoolean,
    isString,
    isSummable,
    isCategory,
    isDimension,
    isMetric,
    isPK,
    isFK
} from "metabase/lib/schema_metadata";

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */
export default class Field extends Base {
    displayName: string;
    description: string;

    table: Table;

    isDate() {
        return isDate(this);
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

    dimension() {
        return new FieldDimension(this, null, [this.id]);
    }
}
