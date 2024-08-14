import { input } from "@inquirer/prompts";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "../types/cli";

export const setupPermissions: CliStepMethod = async state => {
  const hasTenancyIsolation = await toggle({
    message: `Is your tenancy isolation based on a column? (e.g. does your table have a customer_id column to isolate tenants?):`,
    default: true,
  });

  if (!hasTenancyIsolation) {
    // TODO: generate a sample Express app

    return [{ type: "success" }, state];
  }

  if (!state.tables) {
    return [
      { type: "error", message: "You have not selected any tables." },
      state,
    ];
  }

  const tenancyColumnNames: Record<string, string> = {};
  let defaultColumnName: string | undefined = undefined;

  for (const table of state.tables) {
    const columnName = await input({
      message: `What is the multi-tenancy column for ${table.name}? Leave empty if this table does not have a multi-tenancy column:`,
      default: defaultColumnName,
    });

    if (columnName) {
      defaultColumnName = columnName;
      tenancyColumnNames[table.id] = columnName;
    }
  }

  if (Object.keys(tenancyColumnNames).length === 0) {
    const message = "Your tables do not have any multi-tenancy column.";

    return [{ type: "error", message }, state];
  }

  // Configure "our analytics" and "examples" to be no access by “All Users”

  return [{ type: "success" }, state];
};
