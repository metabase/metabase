/* @flow */

import Base from "./Base";
import Table from "./Table";

import { isDate, isNumeric, isBoolean, isString, isSummable, isCategory, isDimension, isMetric } from "metabase/lib/schema_metadata";

export default class Field extends Base {
    static type = "field";
    static schema = {};

    table_id: number;
    fk_target_field_id: number;

    table() {
        return this._entity(Table, this.table_id);
    }

    target() {
        return this._entity(Field, this.fk_target_field_id);
    }

    isDate()      { return isDate(this._object); }
    isNumeric()   { return isNumeric(this._object); }
    isBoolean()   { return isBoolean(this._object); }
    isString()    { return isString(this._object); }
    isSummable()  { return isSummable(this._object); }
    isCategory()  { return isCategory(this._object); }
    isMetric()    { return isMetric(this._object); }
    isDimension() { return isDimension(this._object); }
}
