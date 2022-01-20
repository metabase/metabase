import { isa as cljs_isa, TYPE as cljs_TYPE } from "cljs/metabase.types";

export const TYPE = cljs_TYPE;

/**
 * Is x the same as, or a descendant type of, y?
 *
 * @example
 * isa(field.semantic_type, TYPE.Currency);
 *
 * @param {string} x
 * @param {string} y
 * @return {boolean}
 */
export const isa = (x, y) => cljs_isa(x, y);

// convenience functions since these operations are super-common
// this will also make it easier to tweak how these checks work in the future,
// e.g. when we add an `is_pk` column and eliminate the PK semantic type we can just look for places that use isPK

export function isPK(type) {
  return isa(type, TYPE.PK);
}

export function isFK(type) {
  return isa(type, TYPE.FK);
}
