import { createContext, useContext } from "react";

import type { ConcreteTableId } from "metabase-types/api";

type SchemaViewerContextValue = {
  visibleTableIds: Set<ConcreteTableId>;
  /**
   * IDs of tables whose fetch was triggered by an FK-field expansion and has
   * not yet resolved. Field rows use this to show a loader in place of the
   * database type while the new table is being loaded.
   */
  expandingTableIds: Set<ConcreteTableId>;
  onExpandToTable: (
    tableId: ConcreteTableId,
    /**
     * Edge IDs to try selecting once the new table arrives in the graph.
     * Pass both possible orderings (source-first and target-first) since
     * the backend's source/target convention isn't fixed.
     */
    candidateEdgeIdsToSelect?: readonly string[],
  ) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  /**
   * Pan/zoom to a single node using the shared zoom rules (≥0.5 zoom, header
   * pinned near the top). Coalesces with other zoom calls in the same tick
   * — only the last request wins.
   */
  zoomToNode: (nodeId: string) => void;
};

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  expandingTableIds: new Set(),
  onExpandToTable: () => {},
  selectedNodeId: null,
  onSelectNode: () => {},
  zoomToNode: () => {},
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}
