import { createContext, useContext, useSyncExternalStore } from "react";

import type { ConcreteTableId } from "metabase-types/api";

import {
  type SchemaViewerDetailsStore,
  createSchemaViewerDetailsStore,
} from "./hooks/useSchemaViewerDetails";

type SchemaViewerContextValue = {
  visibleTableIds: Set<ConcreteTableId>;
  detailsStore: SchemaViewerDetailsStore;
  /**
   * IDs of tables whose fetch was triggered by an FK-field expansion and has
   * not yet resolved. Field rows use this to show a loader in place of the
   * database type while the new table is being loaded.
   */
  expandingTableIds: Set<ConcreteTableId>;
  expandToTable: (
    tableId: ConcreteTableId,
    /**
     * Edge IDs to try selecting once the new table arrives in the graph.
     * Pass both possible orderings (source-first and target-first) since
     * the backend's source/target convention isn't fixed.
     */
    candidateEdgeIdsToSelect?: readonly string[],
  ) => void;
  selectedNodeId: string | null;
  selectNode: (nodeId: string | null) => void;
  zoomToNode: (nodeId: string) => void;
  /** Selects exactly these logical edges, rendered or not. */
  selectEdges: (edgeIds: ReadonlySet<string>) => void;
};

const defaultDetailsStore = createSchemaViewerDetailsStore();
const getServerDetailSnapshot = () => false;

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  detailsStore: defaultDetailsStore,
  expandingTableIds: new Set(),
  expandToTable: () => {},
  selectedNodeId: null,
  selectNode: () => {},
  zoomToNode: () => {},
  selectEdges: () => {},
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}

export function useIsSchemaViewerNodeDetailed(nodeId: string) {
  const { detailsStore } = useSchemaViewerContext();
  const nodeStore = detailsStore.forNode(nodeId);
  return useSyncExternalStore(
    nodeStore.subscribe,
    nodeStore.getSnapshot,
    getServerDetailSnapshot,
  );
}
