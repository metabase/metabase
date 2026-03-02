import { createContext, useContext } from "react";

import type { TableId } from "metabase-types/api";

interface SchemaViewerContextValue {
  visibleTableIds: Set<TableId>;
  onExpandToTable: (tableId: TableId) => void;
  isCompactMode: boolean;
  onToggleCompactMode: (explicit?: boolean) => void;
  explicitFullMode: boolean;
}

export const SchemaViewerContext = createContext<SchemaViewerContextValue>({
  visibleTableIds: new Set(),
  onExpandToTable: () => {},
  isCompactMode: false,
  onToggleCompactMode: () => {},
  explicitFullMode: false,
});

export function useSchemaViewerContext() {
  return useContext(SchemaViewerContext);
}

export function useIsCompactMode(): boolean {
  return useContext(SchemaViewerContext).isCompactMode;
}
