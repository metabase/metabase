import type { FieldReference } from "metabase-types/api";

import { propagateErrorResponse } from "./propagate-error-response";

interface Options {
  tableId: number;
  fieldRef: FieldReference;
  databaseId: number;
  instanceUrl: number;
}

/**
 * Sample a random row from the tenancy column.
 * This is used to assign the user attribute of `customer_id`
 *
 * TODO: WIP
 */
export async function queryTenancyColumnValues(options: Options) {
  const { fieldRef, tableId, databaseId, instanceUrl } = options;

  // Sample a couple of values from the table
  const res = await fetch(`${instanceUrl}/api/dataset`, {
    method: "POST",
    body: JSON.stringify({
      type: "query",
      database: databaseId,
      query: {
        "source-table": tableId,
        filter: ["not-null", fieldRef],
        limit: 20,
      },
      parameters: [],
    }),
  });

  // TODO: get top 3 values to assign the customer_id to each customer.

  await propagateErrorResponse(res);
}
