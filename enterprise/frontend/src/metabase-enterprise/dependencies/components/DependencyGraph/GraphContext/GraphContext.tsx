import { createContext } from "react";

import type { GraphContextType } from "../types";

export const GraphContext = createContext<GraphContextType>({
  selection: null,
  setSelection: () => undefined,
  openLinksInNewTab: true,
});
