/* @flow */

import Base from "./Base";
import Field from "./Field";
import Database from "./Database";


export default class Table extends Base {
    static type = "tables";
    static schema = {
        fields: [Field]
    };

    id: number;
    display_name: string;
    db_id: number;

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
