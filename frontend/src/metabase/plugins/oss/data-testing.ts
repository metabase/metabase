import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type DataTestingPlugin = {
  isEnabled: boolean;
  getTransformTestRoutes: () => ReactNode;
  getMetricTestRoutes: () => ReactNode;
  getPublishedTableSegmentTestRoutes: () => ReactNode;
  getDataModelSegmentTestRoutes: () => ReactNode;
};

const getDefaultPluginDataTesting = (): DataTestingPlugin => ({
  isEnabled: false,
  getTransformTestRoutes: () => null,
  getMetricTestRoutes: () => null,
  getPublishedTableSegmentTestRoutes: () => null,
  getDataModelSegmentTestRoutes: () => null,
});

export const PLUGIN_DATA_TESTING = definePluginSlot(
  getDefaultPluginDataTesting,
);
