import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type DataTestingPlugin = {
  isEnabled: boolean;
  getTransformTestRoutes: () => ReactNode;
  getMetricTestRoutes: () => ReactNode;
  getActionTestRoutes: () => ReactNode;
};

const getDefaultPluginDataTesting = (): DataTestingPlugin => ({
  isEnabled: false,
  getTransformTestRoutes: () => null,
  getMetricTestRoutes: () => null,
  getActionTestRoutes: () => null,
});

export const PLUGIN_DATA_TESTING = definePluginSlot(
  getDefaultPluginDataTesting,
);
