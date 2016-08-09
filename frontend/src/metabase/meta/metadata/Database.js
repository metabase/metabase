/* @flow */

import Base from "./Base";
import Table from "./Table";

export default class Database extends Base {
    static type = "databases";
    static schema = {
        tables: [Table]
    };

    table(id: number) {
        return this._entity(Table, id);
    }

    tables() {
        return this._entities(Table, this._object.tables);
    }
}
