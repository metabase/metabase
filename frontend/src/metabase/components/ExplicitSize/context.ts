import { createContext } from "react";

import type { RefreshMode } from "./ExplicitSize";

// Only used for Loki snapshots
export const explicitSizeRefreshModeContext = createContext<RefreshMode | null>(
  null,
);
