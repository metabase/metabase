import { createContext } from "react";
import type { GraphNodeModel } from "../../src/shared-types";

export interface GraphSelection {
  key: string;
  model: GraphNodeModel;
  groupType?: GraphNodeModel;
}

export interface GraphContextType {
  selection: GraphSelection | null;
  setSelection: (selection: GraphSelection | null) => void;
}

export const GraphContext = createContext<GraphContextType>({
  selection: null,
  setSelection: () => undefined,
});
