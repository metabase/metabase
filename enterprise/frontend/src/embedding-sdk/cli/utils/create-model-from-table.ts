import type { Table } from "metabase-types/api";

import { propagateErrorResponse } from "./propagate-error-response";

interface Options {
  tableId: number;
  databaseId: number;

  cookie: string;
  instanceUrl: string;
}

export async function createModelFromTable(options: Options) {
  const { instanceUrl, databaseId, tableId, cookie = "" } = options;

  const datasetQuery = {
    type: "query",
    database: databaseId,
    query: { "source-table": tableId },
  };

  // Generate the query metadata
  let res = await fetch(`${instanceUrl}/api/database/query_metadata`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(datasetQuery),
  });

  await propagateErrorResponse(res);

  const { tables } = (await res.json()) as { tables: Table[] };
  const [{ display_name: displayName }] = tables;

  // Create a new card
  res = await fetch(`${instanceUrl}/api/card`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: displayName,
      type: "model",
      display: "table",
      collection_id: null,
      result_metadata: null,
      collection_position: 1,
      visualization_settings: {},
      database_id: databaseId,
      dataset_query: datasetQuery,
    }),
  });

  await propagateErrorResponse(res);

  const { id: cardId } = (await res.json()) as { id: number };

  // Create a new dataset
  res = await fetch(`${instanceUrl}/api/dataset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      type: "query",
      database: databaseId,
      query: { "source-table": `card__${cardId}` },
      parameters: [],
    }),
  });
}
