import { checkbox } from "@inquirer/prompts";
import ora from "ora";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import type { Table } from "metabase-types/api";

import { propagateErrorResponse } from "../utils/propagate-error-response";
import { retry } from "../utils/retry";

export const pickDatabaseTables: CliStepMethod = async state => {
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
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Cannot fetch database schema. Reason: ${reason}`;
    spinner.fail();

    return [{ type: "error", message }, state];
  }

  const tables: Table[] = [];

  // Fetch the database tables
  for (const schemaKey of schemas) {
    const url = `${instanceUrl}/api/database/${databaseId}/schema/${schemaKey}?include_hidden=true`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "content-type": "application/json", cookie },
    });

    if (!res.ok) {
      const message = `Cannot fetch database table from schema ${schemaKey}.`;

      return [{ type: "error", message }, state];
    }

    const schemaTables: Table[] = await res.json();

    tables.push(...schemaTables);
  }

  if (tables.length === 0) {
    spinner.fail();

    return [{ type: "error", message: "No tables found in database." }, state];
  }

  spinner.succeed();

  const chosenTables = await checkbox({
    validate: choices => {
      if (choices.length === 0) {
        return "Pick 1 - 3 tables to embed.";
      }

      if (choices.length > 3) {
        return "You can only choose up to 3 tables.";
      }

      return true;
    },
    message: "Pick 1 - 3 tables to embed:",
    choices: tables.map(table => ({
      name: table.name,
      value: table,
    })),
  });

  return [{ type: "done" }, { ...state, tables, chosenTables }];
};
