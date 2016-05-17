/* @flow */

import Base from "./Base";
import Table from "./Table";

import * as SchemaMetadata from "metabase/lib/schema_metadata";

const TYPE_METHODS = [
    "isDate",
    "isNumeric",
    "isBoolean",
    "isString",
    "isSummable",
    "isCategory",
    "isDimension",
    "isMetric"
]

export default class Field extends Base {
    static type = "field";
    static schema = {};

    table() {
        return this._entity(Table, this.table_id);
    }

    target() {
        return this._entity(Field, this.fk_target_field_id);
    }
}

TYPE_METHODS.map(method => {
    Field.prototype[method] = function() {
        return SchemaMetadata[method](this._object);
    }
});
