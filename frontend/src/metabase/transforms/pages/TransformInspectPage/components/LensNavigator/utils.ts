import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { InspectorLensMetadata, LensParams } from "metabase-types/api";

import type { LensRef } from "../../types";

import type { DynamicLensTab, StaticLensTab } from "./types";

export const toLensRef = (
  source: InspectorLensMetadata | TriggeredDrillLens,
): LensRef => {
  if ("lens_id" in source) {
    return {
      id: source.lens_id,
      params: source.params,
    };
  }
  return { id: source.id };
};

export const getLensKey = (ref: LensRef): string => {
  if (!ref.params) {
    return ref.id;
  }
  const searchParams = new URLSearchParams(ref.params);
  searchParams.sort();
  return `${ref.id}?${searchParams.toString()}`;
};

export const parseLocationParams = (search: string): LensParams | undefined => {
  const params = new URLSearchParams(search);
  return params.size > 0 ? Object.fromEntries(params) : undefined;
};

export const createStaticTab = (
  lensMetadata: InspectorLensMetadata,
): StaticLensTab => {
  const ref = toLensRef(lensMetadata);
  return {
    key: getLensKey(ref),
    title: lensMetadata.display_name,
    isStatic: true,
    lensRef: ref,
    complexity: lensMetadata.complexity,
  };
};

export const createDynamicTab = (ref: LensRef): DynamicLensTab => ({
  key: getLensKey(ref),
  isStatic: false,
  lensRef: ref,
});
