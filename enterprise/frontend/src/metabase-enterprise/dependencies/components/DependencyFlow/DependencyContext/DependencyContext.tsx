import { createContext } from "react";

import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

export type DependencyContextType = {
  selectedGroupNode?: DependencyNode;
  selectedGroupType?: DependencyGroupType;
  handleSelectDependencyGroup: (
    node: DependencyNode,
    type: DependencyGroupType,
  ) => void;
};

export const DependencyContext = createContext<DependencyContextType>({
  handleSelectDependencyGroup: () => undefined,
});
