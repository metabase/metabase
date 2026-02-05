import type { InspectorLensComplexity } from "metabase-types/api";

export type LensTab = {
  id: string;
  lensRef: LensRef;
  isStatic?: boolean;
  complexity?: InspectorLensComplexity;
};

export type LensRef = {
  id: string;
  title: string;
  params?: Record<string, unknown>;
};
