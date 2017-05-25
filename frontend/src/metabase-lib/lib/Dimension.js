/* @flow */

import Query_DEPRECATED from "metabase/lib/query";
import { mbqlEq } from "metabase/lib/query/util";
import _ from "underscore";

import Field from "./metadata/Field";
import Metadata from "./metadata/Metadata";

import type {
    ConcreteField,
    LocalFieldReference,
    ForeignFieldReference,
    DatetimeField,
    ExpressionReference
} from "metabase/meta/types/Query";

type IconName = string;

/**
 * Dimension base class
 * @abstract
 */
export default class Dimension {
    _parent: ?Dimension;
    _args: any[];
    _metadata: Metadata;

    constructor(parent: ?Dimension, args: any[], metadata: Metadata) {
        this._parent = parent;
        this._args = args;
        this._metadata = metadata || (parent && parent._metadata);
    }

    static parseMBQL(mbql: ConcreteField, metadata?: Metadata) {
        for (const D of DIMENSION_TYPES) {
            const dimension = D.parseMBQL(mbql, metadata);
            if (dimension != null) {
                return dimension;
            }
        }
        return null;
    }

    static isEqual(a: ?Dimension | ConcreteField, b: ?Dimension): boolean {
        // $FlowFixMe
        let dimensionA: ?Dimension = a instanceof Dimension
            ? a
            : Dimension.parseMBQL(a);
        // $FlowFixMe
        let dimensionB: ?Dimension = b instanceof Dimension
            ? b
            : Dimension.parseMBQL(b);
        return !!dimensionA && !!dimensionB && dimensionA.isEqual(dimensionB);
    }

    // TODO: better names for these
    subDisplayName(): string {
        return "";
    }
    subTriggerDisplayName(): string {
        return this.subDisplayName();
    }

    icon(): ?IconName {
        return null;
    }

    static dimensions(parent: Dimension): Dimension[] {
        return [];
    }
    static defaultDimension(parent: Dimension): ?Dimension {
        return null;
    }

    dimensions(DimensionTypes: any[] = DIMENSION_TYPES): Dimension[] {
        return [].concat(
            ...DimensionTypes.map(DimensionType =>
                DimensionType.dimensions(this))
        );
    }

    defaultDimension(DimensionTypes: any[] = DIMENSION_TYPES): ?Dimension {
        for (const DimensionType of DimensionTypes) {
            const defaultDimension = DimensionType.defaultDimension(this);
            if (defaultDimension) {
                return defaultDimension;
            }
        }
        return null;
    }

    isEqual(other: ?Dimension | ConcreteField): boolean {
        if (other == null) {
            return false;
        }

        let otherDimension: ?Dimension = other instanceof Dimension
            ? other
            : Dimension.parseMBQL(other);
        if (!otherDimension) {
            return false;
        }
        // must be instace of the same class
        if (this.constructor !== otherDimension.constructor) {
            return false;
        }
        // must both or neither have a parent
        if (!this._parent !== !otherDimension._parent) {
            return false;
        }
        // parents must be equal
        if (this._parent && !this._parent.isEqual(otherDimension._parent)) {
            return false;
        }
        // args must be equal
        if (!_.isEqual(this._args, otherDimension._args)) {
            return false;
        }
        return true;
    }

    isSameBaseDimension(other: ?Dimension | ConcreteField): boolean {
        if (other == null) {
            return false;
        }

        let otherDimension: ?Dimension = other instanceof Dimension
            ? other
            : Dimension.parseMBQL(other);

        const baseDimensionA = this.baseDimension();
        const baseDimensionB = otherDimension && otherDimension.baseDimension();
        return !!baseDimensionA &&
            !!baseDimensionB &&
            baseDimensionA.isEqual(baseDimensionB);
    }

    baseDimension(): Dimension {
        return this;
    }
}

/**
 * Field based dimension, abstract class for field-id, fk->, datetime-field, etc
 * @abstract
 */
export class FieldDimension extends Dimension {
    // displayName(): string {
    //     if (this.field().isFK()) {
    //         return stripId(super.displayName());
    //     } else {
    //         return super.displayName();
    //     }
    // }
    field() {
        return this._parent.field();
    }
    displayName(): string {
        return Query_DEPRECATED.getFieldPathName(
            this.field().id,
            this.field().table
        );
    }
    subDisplayName(): string {
        return this.field().display_name;
    }
    icon() {
        return this.field().icon();
    }
}

export class FieldIDDimension extends FieldDimension {
    static parseMBQL(mbql: ConcreteField, metadata: Metadata) {
        if (typeof mbql === "number") {
            // DEPRECATED: bare field id
            return new FieldIDDimension(null, [mbql], metadata);
        } else if (Array.isArray(mbql) && mbqlEq(mbql[0], "field-id")) {
            return new FieldIDDimension(null, mbql.slice(1), metadata);
        }
        return null;
    }
    field() {
        return this._metadata.fields[this._args[0]];
    }
    mbql(): LocalFieldReference {
        return ["field-id", this._args[0]];
    }
}

export class FKDimension extends FieldDimension {
    static parseMBQL(mbql: ConcreteField, metadata: Metadata): ?Dimension {
        if (Array.isArray(mbql) && mbqlEq(mbql[0], "fk->")) {
            // $FlowFixMe
            const fkRef: ForeignFieldReference = mbql;
            const parent = Dimension.parseMBQL(fkRef[1], metadata);
            return new FKDimension(parent, fkRef.slice(2));
        }
        return null;
    }

    static dimensions(parent: Dimension): Dimension[] {
        if (parent instanceof FieldDimension) {
            const field = parent.field();
            if (field.target && field.target.table) {
                return field.target.table.fields.map(
                    field => new FKDimension(parent, [field.id])
                );
            }
        }
        return [];
    }

    field() {
        return this._metadata.fields[this._args[0]];
    }

    mbql(): ForeignFieldReference {
        // TODO: not sure `this._parent._args[0]` is the best way to handle this?
        // we don't want the `["field-id", ...]` wrapper from the `this._parent.mbql()`
        return ["fk->", this._parent._args[0], this._args[0]];
    }
}

import { DATETIME_UNITS, formatBucketing } from "metabase/lib/query_time";

const isFieldDimension = dimension =>
    dimension instanceof FieldIDDimension || dimension instanceof FKDimension;

export class DatetimeFieldDimension extends FieldDimension {
    static parseMBQL(mbql: ConcreteField, metadata: Metadata): ?Dimension {
        if (Array.isArray(mbql) && mbqlEq(mbql[0], "datetime-field")) {
            const parent = Dimension.parseMBQL(mbql[1], metadata);
            // DEPRECATED: ["datetime-field", id, "of", unit]
            if (mbql.length === 4) {
                return new DatetimeFieldDimension(parent, mbql.slice(3));
            } else {
                return new DatetimeFieldDimension(parent, mbql.slice(2));
            }
        }
        return null;
    }

    static dimensions(parent: Dimension): Dimension[] {
        if (isFieldDimension(parent) && parent.field().isDate()) {
            return DATETIME_UNITS.map(
                unit => new DatetimeFieldDimension(parent, [unit])
            );
        }
        return [];
    }

    static defaultDimension(parent: Dimension): ?Dimension {
        if (isFieldDimension(parent) && parent.field().isDate()) {
            return new DatetimeFieldDimension(parent, ["day"]);
        }
        return null;
    }

    subDisplayName(): string {
        return formatBucketing(this._args[0]);
    }
    subTriggerDisplayName(): string {
        return "by " + formatBucketing(this._args[0]).toLowerCase();
    }

    mbql(): DatetimeField {
        return ["datetime-field", this._parent.mbql(), this._args[0]];
    }

    baseDimension(): Dimension {
        return this._parent.baseDimension();
    }
}

export class BinnedDimension extends FieldDimension {
    static parseMBQL(mbql: ConcreteField, metadata) {
        if (Array.isArray(mbql) && mbqlEq(mbql[0], "binning-strategy")) {
            const parent = Dimension.parseMBQL(mbql[1], metadata);
            return new BinnedDimension(parent, mbql.slice(2));
        }
        return null;
    }

    static dimensions(parent: Dimension): Dimension[] {
        if (isFieldDimension(parent) && parent.field().isNumber()) {
            return [5, 10, 25, 100].map(
                bins => new BinnedDimension(parent, ["default", bins])
            );
        }
        return [];
    }

    subDisplayName(): string {
        return this._args[1] + " bins";
    }

    mbql() {
        return ["binning-strategy", this._parent.mbql(), ...this._args];
    }

    baseDimension(): Dimension {
        return this._parent.baseDimension();
    }
}

export class ExpressionDimension extends Dimension {
    tag = "Custom";

    static parseMBQL(mbql): ?Dimension {
        if (Array.isArray(mbql) && mbqlEq(mbql[0], "expression")) {
            return new ExpressionDimension(null, mbql.slice(1));
        }
    }

    displayName(): string {
        return this._args[0];
    }

    mbql(): ExpressionReference {
        return ["expression", this._args[0]];
    }

    icon(): IconName {
        // TODO: eventually will need to get the type from the return type of the expression
        return "int";
    }
}

const DIMENSION_TYPES = [
    FieldIDDimension,
    FKDimension,
    DatetimeFieldDimension,
    ExpressionDimension,
    BinnedDimension
];
