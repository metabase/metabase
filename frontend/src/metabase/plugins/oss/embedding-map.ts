import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

type EmbeddingMapPlugin = {
  isEnabled: boolean;
  getDataStudioEmbeddingMapRoutes: () => ReactNode;
};

const getDefaultPluginEmbeddingMap = (): EmbeddingMapPlugin => ({
  isEnabled: false,
  getDataStudioEmbeddingMapRoutes: () => null,
});

export const PLUGIN_EMBEDDING_MAP = definePluginSlot(
  getDefaultPluginEmbeddingMap,
);
