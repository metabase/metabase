/* @flow */

import Base from "./Base";
import Field from "./Field";
import Database from "./Database";

import type { TableId, Table as TableObject } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { FieldId } from "metabase/meta/types/Field";

type EntitiesTableObject = TableObject & {
    fields: Array<FieldId>
}

export default class Table extends Base {
    static type = "tables";
    static schema = {
        fields: [Field]
    };

    _object: EntitiesTableObject;

    id: TableId;
    display_name: string;
    db_id: DatabaseId;

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
