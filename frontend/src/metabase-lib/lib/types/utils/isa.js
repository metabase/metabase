import { isa as cljs_isa } from "cljs/metabase.types";

import { TYPE } from "metabase-lib/lib/types/constants";

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

export function isTypePK(type) {
  return isa(type, TYPE.PK);
}

export function isTypeFK(type) {
  return isa(type, TYPE.FK);
}
