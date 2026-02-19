import { checkbox } from "@inquirer/prompts";
import ora from "ora";

import type { CliStepMethod } from "embedding-sdk-package/cli/types/cli";
import type { Table, TableId } from "metabase-types/api";

import { SAMPLE_DATABASE_SELECTED_TABLES } from "../constants/config";
import {
  cliError,
  propagateErrorResponse,
} from "../utils/propagate-error-response";
import { retry } from "../utils/retry";

export const pickDatabaseTables: CliStepMethod = async (state) => {
  const { instanceUrl, databaseId, cookie = "" } = state;

  const spinner = ora("Fetching database schemas and tables…").start();
  let schemas: string[] = [];

  // Fetch the database schemas
  try {
    schemas = await retry(
      async () => {
        const url = `${instanceUrl}/api/database/${databaseId}/schemas`;

        const res = await fetch(url, {
          method: "GET",
          headers: { "content-type": "application/json", cookie },
        });

        const schemas: string[] = await res.json();
        await propagateErrorResponse(res);

        if (schemas.length === 0) {
          throw new Error("Your database does not have any schemas.");
        }

        return schemas;
      },
      { retries: 10, delay: 1000 },
    );
  } catch (error) {
    spinner.fail();

    return [cliError("Cannot fetch database schema", error), state];
  }

  const tablesWithoutMetadata: Table[] = [];

  try {
    // Scan the database tables in each schemas
    for (const schema of schemas) {
      const url = `${instanceUrl}/api/database/${databaseId}/schema/${encodeURIComponent(schema)}?include_hidden=true`;

      const res = await fetch(url, {
        method: "GET",
        headers: { "content-type": "application/json", cookie },
      });

      await propagateErrorResponse(res);

      const schemaTables: Table[] = await res.json();
      tablesWithoutMetadata.push(...schemaTables);
    }
  } catch (error) {
    return [cliError("Cannot scan database tables", error), state];
  }

  if (tablesWithoutMetadata.length === 0) {
    spinner.fail();

    return [{ type: "error", message: "No tables found in database." }, state];
  }

  spinner.succeed();

  let chosenTableIds: TableId[] = [];

  if (!state.useSampleDatabase) {
    chosenTableIds = await checkbox({
      validate: (choices) => {
        if (choices.length === 0) {
          return "Pick 1 - 3 tables to embed.";
        }

        if (choices.length > 3) {
          return "You can only choose up to 3 tables.";
        }

        return true;
      },
      message: "Pick 1 - 3 tables to embed:",
      choices: tablesWithoutMetadata.map((table) => ({
        name: table.name,
        value: table.id,
      })),
    });
  } else {
    // The user does not know about the sample database's structure,
    // so we pick a couple tables for them.
    chosenTableIds = tablesWithoutMetadata
      .filter((item) => SAMPLE_DATABASE_SELECTED_TABLES.includes(item.name))
      .map((table) => table.id);
  }

  spinner.start("Fetching table metadata...");

  const chosenTables: Table[] = [];

  try {
    for (const tableId of chosenTableIds) {
      const datasetQuery = {
        type: "query",
        database: databaseId,
        query: { "source-table": tableId },
      };

      // The table's fields may still be syncing, so we retry a few times.
      const table = await retry(
        async () => {
          // Get the query metadata from a table
          const res = await fetch(`${instanceUrl}/api/dataset/query_metadata`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie },
            body: JSON.stringify(datasetQuery),
          });

          await propagateErrorResponse(res);

          const metadataResult = (await res.json()) as { tables: Table[] };
          const table = metadataResult.tables.find((t) => t.id === tableId);

          if (!table) {
            throw new Error(`Table "${tableId}" not found.`);
          }

          if (!table?.fields || table.fields.length === 0) {
            throw new Error(`Table "${table.name}" has no fields.`);
          }

          return table;
        },
        { retries: 5, delay: 1000 },
      );

      chosenTables.push(table);
    }
  } catch (error) {
    return [cliError("Cannot fetch table metadata", error), state];
  }

  spinner.succeed();

  return [
    { type: "done" },
    { ...state, tables: tablesWithoutMetadata, chosenTables },
  ];
};
