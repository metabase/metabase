import type { Dataset, FieldReference, Table } from "metabase-types/api";

import { propagateErrorResponse } from "./propagate-error-response";

interface Options {
  table: Table;
  columnName: string;
  databaseId: number;
  limit: number;

  cookie: string;
  instanceUrl: string;
}

interface SampleFromTableOptions {
  databaseId: number;
  chosenTables: Table[];
  tenancyColumnNames: Record<string, string>;

  cookie: string;
  instanceUrl: string;
}

type TenantId = string | number;
type TenantIdsMap = Record<string, TenantId[]>;

/**
 * Sample tenant IDs from multiple chosen tables.
 * If a table doesn't have enough rows, we look up from the next one.
 */
export async function sampleTenantIdsFromTables(
  options: SampleFromTableOptions,
) {
  const { chosenTables, databaseId, cookie, instanceUrl, tenancyColumnNames } =
    options;

  const tenantIdsMap: TenantIdsMap = {};
  const unsampledTableNames: string[] = [];

  // Get sample values for the tenancy column.
  for (const table of chosenTables) {
    const columnName = tenancyColumnNames[table.id];

    const values = await sampleTenantIds({
      table,
      limit: 15,
      databaseId,
      columnName,

      cookie,
      instanceUrl,
    });

    // Skip this table if it has no tenants.
    if (values && values.length > 0) {
      tenantIdsMap[columnName] = values;
    } else {
      unsampledTableNames.push(table.name);
    }
  }

  return { tenantIdsMap, unsampledTableNames };
}

/**
 * Sample a random tenancy column.
 * This is used to assign the user attribute of `customer_id`
 */
export async function sampleTenantIds(
  options: Options,
): Promise<TenantId[] | null> {
  const { limit, table, columnName, databaseId, instanceUrl, cookie } = options;

  const field = table.fields?.find(f => f.name === columnName);

  if (!table || !field) {
    return null;
  }

  const fieldRef: FieldReference = [
    "field",
    Number(field.id),
    { "base-type": field.base_type },
  ];

  // Sample a couple of values from the table
  const res = await fetch(`${instanceUrl}/api/dataset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      type: "query",
      database: databaseId,
      query: {
        limit,
        "source-table": table.id,

        // list the tenant ids (e.g. [[1], [2], [3]])
        breakout: fieldRef,
      },
      parameters: [],
    }),
  });

  await propagateErrorResponse(res);

  const dataset = (await res.json()) as Dataset;

  return dataset.data.rows.flat().filter(value => value !== null) as TenantId[];
}
