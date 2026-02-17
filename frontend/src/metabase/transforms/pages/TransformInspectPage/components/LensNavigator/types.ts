import type { InspectorLensComplexity } from "metabase-types/api";

import type { LensRef } from "../../types";

export type StaticLensTab = {
  key: string;
  title: string;
  isStatic: true;
  lensRef: LensRef;
  isFullyLoaded?: boolean;
  complexity?: InspectorLensComplexity;
};

export type DynamicLensTab = {
  key: string;
  title?: string;
  isStatic: false;
  lensRef: LensRef;
  isFullyLoaded?: boolean;
};

export type LensTab = StaticLensTab | DynamicLensTab;
