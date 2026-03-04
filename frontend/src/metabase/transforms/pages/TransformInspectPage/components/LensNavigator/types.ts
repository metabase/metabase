import type { InspectorLensComplexity } from "metabase-types/api";

import type { LensHandle } from "../../types";

export type StaticLensTab = {
  key: string;
  title: string;
  isStatic: true;
  lensHandle: LensHandle;
  isFullyLoaded?: boolean;
  complexity?: InspectorLensComplexity;
};

export type DynamicLensTab = {
  key: string;
  title?: string;
  isStatic: false;
  lensHandle: LensHandle;
  isFullyLoaded?: boolean;
};

export type LensTab = StaticLensTab | DynamicLensTab;
