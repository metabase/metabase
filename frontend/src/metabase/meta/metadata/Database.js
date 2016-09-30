/* @flow */

import Base from "./Base";
import Table from "./Table";

import type { Database as DatabaseObject } from "metabase/meta/types/Database";
import type { TableId } from "metabase/meta/types/Table";

type EntitiesDatabaseObject = DatabaseObject & {
    tables: Array<TableId>
}

export default class Database extends Base {
    static type = "databases";
    static schema = {
        tables: [Table]
    };

    _object: EntitiesDatabaseObject;

    table(id: number) {
        return this._entity(Table, id);
    }

    tables() {
        return this._entities(Table, this._object.tables);
    }
}
