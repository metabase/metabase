import type { Lens } from "../../types";
import { isDrillLens } from "../../utils";

import type { LensTab } from "./types";

export const getDrillLensTabKey = (lens: Lens): string => {
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

export const createTab = (lens: Lens): LensTab => {
  if (isDrillLens(lens)) {
    return {
      key: getDrillLensTabKey(lens),
      title: lens.reason ?? lens.lens_id,
      isStatic: false,
      lens,
    };
  }
  return {
    key: lens.id,
    title: lens.display_name,
    isStatic: true,
    lens,
  };
};
