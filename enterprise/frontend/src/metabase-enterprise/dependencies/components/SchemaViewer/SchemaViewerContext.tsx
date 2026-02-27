import { useStore } from "@xyflow/react";
import { createContext, useContext } from "react";

import type { TableId } from "metabase-types/api";

import { COMPACT_ZOOM_THRESHOLD } from "./constants";

interface SchemaViewerContextValue {
  visibleTableIds: Set<TableId>;
  onExpandToTable: (tableId: TableId) => void;
}

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  onExpandToTable: () => {},
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}

// Selector that returns boolean based on zoom threshold
// Only triggers re-render when crossing the threshold
const compactModeSelector = (state: { transform: [number, number, number] }) =>
  state.transform[2] <= COMPACT_ZOOM_THRESHOLD;

export function useIsCompactMode(): boolean {
  return useStore(compactModeSelector);
}
