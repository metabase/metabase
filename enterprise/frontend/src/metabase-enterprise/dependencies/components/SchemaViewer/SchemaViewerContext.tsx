import { createContext, useContext } from "react";

import type { ConcreteTableId } from "metabase-types/api";

interface SchemaViewerContextValue {
  visibleTableIds: Set<ConcreteTableId>;
  onExpandToTable: (
    tableId: ConcreteTableId,
    /**
     * Edge IDs to try selecting once the new table arrives in the graph.
     * Pass both possible orderings (source-first and target-first) since
     * the backend's source/target convention isn't fixed.
     */
    candidateEdgeIdsToSelect?: readonly string[],
  ) => void;
}

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  onExpandToTable: () => {},
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}
