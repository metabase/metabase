/* @flow */

import memoize from "./memoize";

import { normalize, schema } from "normalizr";
import { getIn } from "icepick";

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

        const object = getIn(this._metadata._entityMaps, [Klass.type, id]);
        return object && new Klass(object, this._metadata);
    }

    // return an array of wrapped entities
    @memoize
    _entities<T: Base>(Klass: Class<T>, ids: Array<number>): Array<T> {
        if (this !== this._metadata) {
            return this._metadata._entities(...arguments);
        }

        let entities: Array<T> = [];
        for (const id of ids) {
            let entity = this._entity(Klass, id);
            if (entity != null) {
                entities.push(entity);
            }
        }
        return entities;
    }
}


// transform our schema to a normalizr schema
function toNormalizrSchema(Klass: MetaSchemaClass) {
    if (Array.isArray(Klass.schema)) {
        return [toNormalizrSchema(Klass.schema[0])];
    } else {
        const properties = {}
        for (const name in Klass.schema) {
            properties[name] = Array.isArray(Klass.schema[name]) ?
                [toNormalizrSchema(Klass.schema[name][0])] :
                toNormalizrSchema(Klass.schema[name]);
        }
        return new schema.Entity(Klass.type, properties)
    }
}
