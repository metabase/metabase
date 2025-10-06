import { createContext } from "react";

import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

export type DependencyFlowContextType = {
  selectedGroupNode?: DependencyNode;
  selectedGroupType?: DependencyGroupType;
  handleSelectDependencyGroup: (
    node: DependencyNode,
    type: DependencyGroupType,
  ) => void;
};

export const DependencyFlowContext = createContext<DependencyFlowContextType>({
  handleSelectDependencyGroup: () => undefined,
});
