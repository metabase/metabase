import { createContext } from "react";

import type { GraphContextType } from "../types";

export const GraphContext = createContext<GraphContextType>({
  setSelection: () => undefined,
});
