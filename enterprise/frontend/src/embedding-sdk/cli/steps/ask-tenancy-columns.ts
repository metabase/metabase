import { search } from "@inquirer/prompts";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "../types/cli";
import { printHelperText } from "../utils/print";

export const askForTenancyColumns: CliStepMethod = async state => {
  printHelperText(
    `e.g. does your table have a customer_id column to isolate tenants?`,
  );

  const hasTenancyIsolation = await toggle({
    message: `Is your tenancy isolation based on a column?`,
    default: true,
  });

  if (!hasTenancyIsolation) {
    return [{ type: "success" }, state];
  }

  if (!state.chosenTables) {
    const message = "You have not selected any tables.";

    return [{ type: "error", message }, state];
  }

  const tenancyColumnNames: Record<string, string> = {};

  for (const table of state.chosenTables) {
    const fieldChoices = [
      { name: "(no multi-tenancy column for this table)", value: null },
      ...(table.fields?.map(f => ({ name: f.name, value: f.name })) ?? []),
    ];

    const columnName = await search({
      pageSize: 10,
      message: `What is the multi-tenancy column for ${table.name}?`,
      source(term) {
        return term
          ? fieldChoices.filter(choice => choice.name.includes(term))
          : fieldChoices;
      },
    });

    if (columnName) {
      tenancyColumnNames[table.id] = columnName;
    }
  }

  if (Object.keys(tenancyColumnNames).length === 0) {
    const message = "Your tables do not have any multi-tenancy column.";

    return [{ type: "error", message }, state];
  }

  return [{ type: "success" }, { ...state, tenancyColumnNames }];
};
