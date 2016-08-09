/* @flow */

import Base from "./Base";
import Table from "./Table";

import { isDate, isNumeric, isBoolean, isString, isSummable, isCategory, isDimension, isMetric, getIconForField } from "metabase/lib/schema_metadata";

export default class Field extends Base {
    static type = "fields";
    static schema = {};

    id: number;
    display_name: string;
    table_id: number;
    fk_target_field_id: number;
    special_type: string;

    table(): Table {
        const table = this._entity(Table, this.table_id);
        if (table == null) {
            throw new Error("Couldn't get the table for this field");
        }
        return table;
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
    isID()        { return this.special_type === "id"; }

    values() {
        return (this._object.values && this._object.values.length > 0 && this._object.values[0].values) || []
    }

    icon() {
        return getIconForField(this._object);
    }
}
