import { useMemo } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import type { TableId } from "metabase-types/api";

export function useTablePath(tableId: TableId | null | undefined) {
  const { data: table } = useGetTableQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  return useMemo(() => {
    if (!table) {
      return null;
    }

    const parts = [];

    if (table.db?.name) {
      parts.push(table.db.name);
    }

    if (table.schema) {
      parts.push(table.schema);
    }

    if (table.display_name) {
      parts.push(table.display_name);
    }

    return parts.length > 0 ? parts.join(" / ") : null;
  }, [table]);
}
