import { getLensKey } from "metabase/api/utils/transform-inspector-lens";
import type {
  InspectorDrillLensTrigger,
  InspectorLensMetadata,
  LensParams,
} from "metabase-types/api";

import type { LensHandle } from "../../types";

import type { DynamicLensTab, StaticLensTab } from "./types";

export { getLensKey };

export const toLensHandle = (
  source: InspectorLensMetadata | InspectorDrillLensTrigger,
): LensHandle => {
  if ("lens_id" in source) {
    return {
      id: source.lens_id,
      params: source.params,
    };
  }
  return { id: source.id };
};

export const parseLocationParams = (search: string): LensParams | undefined => {
  const params = new URLSearchParams(search);
  return params.size > 0 ? Object.fromEntries(params) : undefined;
};

export const createStaticTab = (
  lensMetadata: InspectorLensMetadata,
): StaticLensTab => {
  const ref = toLensHandle(lensMetadata);
  return {
    key: getLensKey(ref),
    title: lensMetadata.display_name,
    isStatic: true,
    lensHandle: ref,
    complexity: lensMetadata.complexity,
  };
};

export const createDynamicTab = (handle: LensHandle): DynamicLensTab => ({
  key: getLensKey(handle),
  isStatic: false,
  lensHandle: handle,
});
