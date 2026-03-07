import type { MetabaseClient } from "./client.js";

/**
 * Shape expected by metabase.lib.js.metadata/metadata-provider:
 * {
 *   databases: { "1": { id: 1, name: "...", engine: "...", ... } },
 *   tables:    { "5": { id: 5, name: "ORDERS", db_id: 1, ... } },
 *   fields:    { "23": { id: 23, name: "STATUS", table_id: 5, ... } },
 *   metrics:   {},
 *   segments:  {},
 *   questions: {},
 * }
 */
export interface MetadataBundle {
  databases: Record<string, unknown>;
  tables: Record<string, unknown>;
  fields: Record<string, unknown>;
  metrics: Record<string, unknown>;
  segments: Record<string, unknown>;
  questions: Record<string, unknown>;
}

/**
 * Fetch database metadata from the API and reshape it into the format
 * expected by metabase.lib.js.metadata/metadata-provider.
 *
 * Uses GET /api/database/:id/metadata which returns everything in one call.
 */
export async function fetchMetadataBundle(
  client: MetabaseClient,
  databaseId: number,
): Promise<MetadataBundle> {
  const { data } = await client.GET(
    `/api/database/${databaseId}/metadata`,
  );

  const raw = data as Record<string, unknown>;
  const tables = (raw?.tables as Array<Record<string, unknown>>) ?? [];

  const bundle: MetadataBundle = {
    databases: {
      [String(databaseId)]: {
        id: databaseId,
        name: raw.name,
        engine: raw.engine,
        features: raw.features ?? [],
        ...(raw.settings ? { settings: raw.settings } : {}),
      },
    },
    tables: {},
    fields: {},
    metrics: {},
    segments: {},
    questions: {},
  };

  for (const table of tables) {
    const tableId = String(table.id);
    const fields = (table.fields as Array<Record<string, unknown>>) ?? [];

    // Store table without nested fields (fields go in top-level map)
    const { fields: _fields, ...tableWithoutFields } = table;
    bundle.tables[tableId] = tableWithoutFields;

    for (const field of fields) {
      bundle.fields[String(field.id)] = field;
    }
  }

  return bundle;
}
