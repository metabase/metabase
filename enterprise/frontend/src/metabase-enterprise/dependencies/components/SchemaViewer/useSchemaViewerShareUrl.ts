import { useMemo } from "react";

import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

interface SchemaViewerShareState {
  databaseId: DatabaseId;
  schema: string | undefined;
  tableIds: ConcreteTableId[];
  hops: number;
}

function encode(state: SchemaViewerShareState): string {
  const payload = {
    d: state.databaseId,
    s: state.schema ?? "",
    t: state.tableIds,
    h: state.hops,
  };
  return btoa(JSON.stringify(payload));
}

export function decodeSchemaViewerShareState(
  encoded: string,
): SchemaViewerShareState | null {
  try {
    const json = JSON.parse(atob(encoded));
    if (
      typeof json.d !== "number" ||
      !Array.isArray(json.t) ||
      typeof json.h !== "number"
    ) {
      return null;
    }
    return {
      databaseId: json.d,
      schema: json.s || undefined,
      tableIds: json.t as ConcreteTableId[],
      hops: json.h,
    };
  } catch {
    return null;
  }
}

export function useSchemaViewerShareUrl({
  databaseId,
  schema,
  tableIds,
  hops,
}: {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  tableIds: ConcreteTableId[] | null;
  hops: number;
}): string | null {
  return useMemo(() => {
    if (databaseId == null || tableIds == null || tableIds.length === 0) {
      return null;
    }
    const encoded = encode({ databaseId, schema, tableIds, hops });
    return `${window.location.origin}${window.location.pathname}?share=${encoded}`;
  }, [databaseId, schema, tableIds, hops]);
}
