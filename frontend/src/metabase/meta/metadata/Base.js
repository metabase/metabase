/* @flow */

import memoize from "./memoize";

import { Schema, arrayOf, normalize } from "normalizr";

type MetaSchemaClass = { type: string, schema: MetaSchema }
type MetaSchemaArrayOf = Array<MetaSchemaClass>
type MetaSchemaType = MetaSchemaClass | MetaSchemaArrayOf;
type MetaSchema = { [key: string]: MetaSchemaType };

export default class Base {
    static type: string;
    static schema: MetaSchema;

    _metadata: Base;
    _object: Object;
    _entityMaps: Object;

    constructor(object: Object, metadata: ?Base) {
        // if metadata is provided assume "object" has been normalized
        if (metadata) {
            this._metadata = metadata
            this._object = object;
        } else {
            let { entities, result } = normalize(object, toNormalizrSchema(this.constructor));
            this._metadata = this;
            this._entityMaps = entities;
            this._object = entities[this.constructor.type][result];
        }

        if (this._object && !Array.isArray(this._object)) {
            for (const name in this._object) {
                // $FlowFixMe
                if (this[name] === undefined) {
                    // $FlowFixMe
                    this[name] = this._object[name];
                }
            }
        }
    }

    // return the wrapped entity
    @memoize
    _entity<T: Base>(Klass: Class<T>, id: number): ?T {
        if (this !== this._metadata) {
            return this._metadata._entity(...arguments);
        }

        if (id == null) {
            return null;
        }

        const object = this._metadata._entityMaps[Klass.type][id];
        if (object == null) {
            throw new Error("Entity " + Klass.type + "[" + id + "] not found in loaded metadata.");
        }
        return new Klass(object, this._metadata);
    }

    // return an array of wrapped entities
    @memoize
    _entities<T: Base>(Klass: Class<T>, ids: Array<number>): Array<?T> {
        if (this !== this._metadata) {
            return this._metadata._entities(...arguments);
        }

        return ids.map(id => this._entity(Klass, id));
    }
}


// transform our schema to a normalizr schema
function toNormalizrSchema(Klass: MetaSchemaClass) {
    if (Array.isArray(Klass.schema)) {
        return arrayOf(toNormalizrSchema(Klass.schema[0]));
    } else {
        const schema : any = new Schema(Klass.type);
        const properties = {}
        for (const name in Klass.schema) {
            properties[name] = Array.isArray(Klass.schema[name]) ? arrayOf(toNormalizrSchema(Klass.schema[name][0])) : toNormalizrSchema(Klass.schema[name]);
        }
        schema.define(properties);
        return schema;
    }
}
