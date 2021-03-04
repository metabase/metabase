import { isa, TYPE } from "cljs/metabase.types";

export { isa, TYPE };

// convenience functions since these operations are super-common
// this will also make it easier to tweak how these checks work in the future,
// e.g. when we add an `is_pk` column and eliminate the PK semantic type we can just look for places that use isPK

export function isPK(type) {
  return isa(type, TYPE.PK);
}

export function isFK(type) {
  return isa(type, TYPE.FK);
}
