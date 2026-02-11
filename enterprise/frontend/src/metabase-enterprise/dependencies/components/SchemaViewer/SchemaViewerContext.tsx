import { createContext, useContext } from "react";

import type { TableId } from "metabase-types/api";

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
