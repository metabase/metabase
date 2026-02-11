import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import type { Lens } from "./types";

export const isDrillLens = (lens: Lens): lens is TriggeredDrillLens =>
  "lens_id" in lens;

export const getLensKey = (lens: Lens): string => {
  if (!isDrillLens(lens)) {
    return lens.id;
  }
  const { params, lens_id: id } = lens;
  if (!params || Object.keys(params).length === 0) {
    return id;
  }
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return `${id}::${JSON.stringify(sorted)}`;
};
