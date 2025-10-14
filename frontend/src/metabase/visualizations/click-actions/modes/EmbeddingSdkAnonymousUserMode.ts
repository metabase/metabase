import type { QueryClickActionsMode } from "../../types";

import { EmbeddingSdkMode } from "./EmbeddingSdkMode";

export const EmbeddingSdkAnonymousUserMode: QueryClickActionsMode = {
  ...EmbeddingSdkMode,
  name: "embedding-sdk-anonymous-user-mode",
  hasDrills: true,
  performSubsetOnlyDrills: true,
};
