/* @flow */

import Query_DEPRECATED from "metabase/lib/query";
import { mbqlEq } from "metabase/lib/query/util";
import _ from "underscore";

import Field from "./metadata/Field";

export default class Dimension {
    _field: ?Field;
    _parent: ?Dimension;
    _args: any[];

    constructor(field, parent, args) {
        // TODO: expression dimensions don't have a field, remove from base class?
        this._field = field;
        this._parent = parent;
        this._args = args;
    }

    static parseMBQL(mbql, parent, field) {
        const DIMENSION_TYPES = [
            FieldDimension,
            FKDimension,
            DatetimeFieldDimension
        ];
        for (const D of DIMENSION_TYPES) {
            const dimension = D.parseMBQL(mbql, parent, field);
            if (dimension != null) {
                return dimension;
            }
        }
    }

    static isEqual(a, b): boolean {
        if (!(a instanceof Dimension)) {
            a = Dimension.parseMBQL(a);
        }
        if (!(b instanceof Dimension)) {
            b = Dimension.parseMBQL(b);
        }
        return a.isEqual(b);
    }

    displayName(): string {
        return Query_DEPRECATED.getFieldPathName(
            this.field().id,
            this.field().table
        );
    }

    field(): Field {
        return this._field;
    }

    dimensions(): Dimension[] {
        return [];
    }

    isEqual(other): boolean {
        // if this isn't a dimension assume it's MBQL and parse it
        if (!(other instanceof Dimension)) {
            other = Dimension.parseMBQL(other);
        }
        // must be instace of the same class
        if (this.constructor !== other.constructor) {
            return false;
        }
        // must both or neither have a parent
        if (!this._parent !== !other._parent) {
            return false;
        }
        // parents must be equal
        if (this._parent && !this._parent.isEqual(other._parent)) {
            return false;
        }
        // args must be equal
        if (!_.isEqual(this._args, other._args)) {
            return false;
        }
        return true;
    }
}

export class FieldDimension extends Dimension {
    static parseMBQL(mbql, parent, field) {
        if (typeof mbql === "number") {
            // DEPRECATED: bare field id
            return new FieldDimension(field, parent, [mbql]);
        } else if (Array.isArray(mbql) && mbqlEq(mbql[0], "field-id")) {
            return new FieldDimension(field, parent, mbql.slice(1));
        }
        return null;
    }

    dimensions(): Dimension[] {
        const field = this.field();
        if (field.target && field.target.table) {
            return field.target.table.fields.map(
                field => new FKDimension(field, this, [field.id])
            );
        } else {
            return [];
        }
    }

    mbql() {
        return ["field-id", this._args[0]];
    }
}

export class FKDimension extends Dimension {
    static parseMBQL(mbql, parent, field) {
        if (mbqlEq(mbql[0], "fk->")) {
            const parent = Dimension.parseMBQL(mbql[1], parent, field);
            return new FKDimension(field, parent, mbql.slice(2));
        }
        return null;
    }

    mbql() {
        // TODO: not sure `this._parent._args[0]` is the best way to handle this?
        // we don't want the `["field-id", ]` wrapper from the `this._parent.mbql()`
        return ["fk->", this._parent._args[0], this._args[0]];
    }
}

export class DatetimeFieldDimension extends Dimension {
    static parseMBQL(mbql, parent, field) {
        if (mbqlEq(mbql[0], "datetime-field")) {
            const parent = Dimension.parseMBQL(mbql[1], parent, field);
            //  v: ["datetime-field", id, "of", unit]
            if (mbql.length === 4) {
                return new DatetimeFieldDimension(field, parent, mbql.slice(3));
            } else {
                return new DatetimeFieldDimension(field, parent, mbql.slice(2));
            }
        }
        return null;
    }

    mbql() {
        return ["datetime-field", this._parent.mbql(), this._args[0]];
    }
}

export class ExpressionDimension extends Dimension {
    static parseMBQL(mbql, parent, field) {
        if (mbqlEq(mbql[0], "expression")) {
            return new ExpressionDimension(field, null, mbql.slice(1));
        }
    }

    displayName(): string {
        return this._args[0];
    }

    mbql() {
        return ["expression", this._args[0]];
    }
}
