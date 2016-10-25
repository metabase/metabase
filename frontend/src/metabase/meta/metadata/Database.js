/* @flow */

import Base from "./Base";
import Table from "./Table";

import type { Database as DatabaseObject, DatabaseId } from "metabase/meta/types/Database";
import type { TableId, SchemaName } from "metabase/meta/types/Table";

import _ from "underscore";

type EntitiesDatabaseObject = DatabaseObject & {
    tables: Array<TableId>
}

export default class Database extends Base {
    static type = "databases";
    static schema = {
        tables: [Table]
    };

    id: DatabaseId;
    name: string;

    _object: EntitiesDatabaseObject;

    table(id: number) {
        return this._entity(Table, id);
    }

    tables() {
        return this._entities(Table, this._object.tables);
    }

    tablesInSchema(schemaName: ?SchemaName) {
        return this._entities(Table, this._object.tables).filter(table => table.schema === schemaName);
    }

    schemaNames(): Array<SchemaName> {
        // $FlowFixMe: flow doesn't understand our null filtering
        return _.uniq(this.tables().map(table => table.schema).filter(schemaName => schemaName != null));
    }
}
