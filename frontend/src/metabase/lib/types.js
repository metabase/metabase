import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";

const PARENTS = MetabaseSettings.get("types");

/// Basically exactly the same as Clojure's isa?
/// Recurses through the type hierarchy until it can give you an answer.
/// isa(TYPE.BigInteger, TYPE.Number) -> true
/// isa(TYPE.Text, TYPE.Boolean) -> false
export function isa(child, ancestor) {
  if (!child || !ancestor) {
    return false;
  }

  if (child === ancestor) {
    return true;
  }

  const parents = PARENTS[child];
  if (!parents) {
    if (child !== "type/*") {
      console.error("Invalid type:", child);
    } // the base type is the only type with no parents, so anything else that gets here is invalid
    return false;
  }

  for (const parent of parents) {
    if (isa(parent, ancestor)) {
      return true;
    }
  }

  return false;
}

// build a pretty sweet dictionary of top-level types, so people can do TYPE.Latitude instead of "type/Latitude" and get error messages / etc.
// this should also make it easier to keep track of things when we tweak the type hierarchy
export let TYPE = {};
for (const type of _.keys(PARENTS)) {
  const key = type.substring(5); // strip off "type/"
  TYPE[key] = type;
}

// convenience functions since these operations are super-common
// this will also make it easier to tweak how these checks work in the future,
// e.g. when we add an `is_pk` column and eliminate the PK special type we can just look for places that use isPK

export function isPK(type) {
  return isa(type, TYPE.PK);
}

export function isFK(type) {
  return isa(type, TYPE.FK);
}
