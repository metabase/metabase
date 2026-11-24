import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type DataTestingPlugin = {
  isEnabled: boolean;
  getTransformTestRoutes: () => ReactNode;
};

const getDefaultPluginDataTesting = (): DataTestingPlugin => ({
  isEnabled: false,
  getTransformTestRoutes: () => null,
});

export const PLUGIN_DATA_TESTING = definePluginSlot(
  getDefaultPluginDataTesting,
);
