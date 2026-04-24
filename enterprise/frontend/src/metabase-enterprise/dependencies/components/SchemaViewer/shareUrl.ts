import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

interface SchemaViewerShareState {
  databaseId: DatabaseId;
  schema: string | undefined;
  tableIds: ConcreteTableId[];
}

export function decodeSchemaViewerShareState(
  encoded: string,
): SchemaViewerShareState | null {
  try {
    const json = JSON.parse(atob(encoded));
    if (typeof json.d !== "number" || !Array.isArray(json.t)) {
      return null;
    }
    return {
      databaseId: json.d,
      schema: json.s || undefined,
      tableIds: json.t as ConcreteTableId[],
    };
  } catch {
    return null;
  }
}
