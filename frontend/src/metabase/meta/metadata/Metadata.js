/* @flow */

import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import Field from "./Field";

export default class Metadata extends Base {
    static type = "metadata";
    static schema = { databases: [Database] };

    constructor(databases: Array<Object>) {
        super({ databases, id: 0 });
    }

    field(id: number) {
        return this._entity(Field, id);
    }
    table(id: number) {
        return this._entity(Table, id);
    }
    database(id: number) {
        return this._entity(Database, id);
    }
    databases() {
        return this._entities(Database, this._object.databases);
    }
}
