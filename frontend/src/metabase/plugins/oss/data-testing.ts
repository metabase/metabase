import type { ReactNode } from "react";

import type { BaseEntityId, TransformTest } from "metabase-types/api";

import { definePluginSlot } from "../slot";

type TransformTestQueryResult = {
  data?: TransformTest;
  error?: unknown;
  isFetching: boolean;
};

export type DataTestingPlugin = {
  isEnabled: boolean;
  getTransformTestRoutes: () => ReactNode;
  useGetTransformTestQuery: (
    entityId: BaseEntityId,
  ) => TransformTestQueryResult;
};

const getDefaultPluginDataTesting = (): DataTestingPlugin => ({
  isEnabled: false,
  getTransformTestRoutes: () => null,
  useGetTransformTestQuery: () => ({ isFetching: false }),
});

export const PLUGIN_DATA_TESTING = definePluginSlot(
  getDefaultPluginDataTesting,
);
