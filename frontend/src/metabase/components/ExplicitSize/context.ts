import { createContext } from "react";

import type { RefreshMode } from "./ExplicitSize";

export const explicitSizeRefreshModeContext = createContext<RefreshMode | null>(
  null,
);
