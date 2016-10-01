/* @flow */

import Base from "./Base";
import Field from "./Field";
import Database from "./Database";

import type { DatabaseId } from "../types/Database";
import type { TableId, SchemaName } from "../types/Table";

export default class Table extends Base {
    static type = "tables";
    static schema = {
        fields: [Field]
    };

    id: TableId;
    schema: ?SchemaName;
    db_id: DatabaseId;
    display_name: string;

    database() {
        return this._entity(Database, this.db_id);
    }

    field(id: number) {
        return this._entity(Field, id);
    }

    fields() {
        return this._entities(Field, this._object.fields);
    }
}
