import { createContext, useContext } from "react";

import type { TableId } from "metabase-types/api";

interface SchemaViewerContextValue {
  visibleTableIds: Set<TableId>;
  onExpandToTable: (tableId: TableId) => void;
  isCompactMode: boolean;
}

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  onExpandToTable: () => {},
  isCompactMode: false,
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}

export function useIsCompactMode(): boolean {
  return useContext(SchemaViewerContext).isCompactMode;
}
