import type {
  InspectorLensComplexity,
  InspectorLensMetadata,
} from "metabase-types/api";

import type { LensRef, LensTab } from "./types";

export const convertLensToRef = (lens: InspectorLensMetadata): LensRef => ({
  id: lens.id,
  title: lens.display_name,
});

export const getLensRefKey = (lensRef: LensRef): string => {
  const { params } = lensRef;
  if (!params || Object.keys(params).length === 0) {
    return lensRef.id;
  }
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return `${lensRef.id}::${JSON.stringify(sorted)}`;
};

export const createTab = (
  lensRef: LensRef,
  isStatic: boolean,
  complexity?: InspectorLensComplexity,
): LensTab => ({
  id: getLensRefKey(lensRef),
  lensRef,
  isStatic,
  complexity,
});
