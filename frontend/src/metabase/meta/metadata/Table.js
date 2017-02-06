/* @flow */

import Base from "./Base";
import Field from "./Field";
import Database from "./Database";

import type { DatabaseId } from "metabase/meta/types/Database";
import type { Table as TableObject, TableId, SchemaName } from "metabase/meta/types/Table";
import type { FieldId } from "metabase/meta/types/Field";

type EntitiesTableObject = TableObject & {
    fields: Array<FieldId>
}

export default class Table extends Base {
    static type = "tables";
    static schema = {
        fields: [Field]
    };

    id: TableId;
    schema: ?SchemaName;
    db_id: DatabaseId;
    display_name: string;

    _object: EntitiesTableObject;

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
