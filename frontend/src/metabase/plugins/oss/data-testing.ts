import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type DataTestingPlugin = {
  isEnabled: boolean;
  getTransformTestRoutes: () => ReactNode;
  getMetricTestRoutes: () => ReactNode;
};

const getDefaultPluginDataTesting = (): DataTestingPlugin => ({
  isEnabled: false,
  getTransformTestRoutes: () => null,
  getMetricTestRoutes: () => null,
});

export const PLUGIN_DATA_TESTING = definePluginSlot(
  getDefaultPluginDataTesting,
);
