import { search } from "@inquirer/prompts";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "../types/cli";
import { printHelperText } from "../utils/print";

export const askForTenancyColumns: CliStepMethod = async state => {
  // The sample database does not have tenancy columns.
  if (state.useSampleDatabase) {
    return [{ type: "success" }, state];
  }

  printHelperText(
    `e.g. does your table have a customer_id column to isolate tenants?`,
  );

  const hasTenancyIsolation = await toggle({
    message: `Is your tenancy isolation based on a column?`,
    default: false,
  });

  if (!hasTenancyIsolation) {
    return [{ type: "success" }, state];
  }

  if (!state.chosenTables) {
    printHelperText(
      "You have not selected any tables. Continuing without tenancy isolation.",
    );

    return [{ type: "success" }, state];
  }

  const tenancyColumnNames: Record<string, string> = {};
  let lastTenancyColumnName: string;

  printHelperText(
    `no tenancy column: all rows in this table will be visible to all users.`,
  );

  printHelperText(
    `selecting a tenancy column: the user will only see rows where its tenant matches the user attribute set via SSO.`,
  );

  for (const table of state.chosenTables) {
    const fieldChoices = [
      // if the user's table of choice does not have any tenant id column, they can skip.
      { name: "(no multi-tenancy column for this table)", value: null },

      // We only select the fields that have a foreign key.
      // We exclude the last tenant id field.
      ...(table.fields
        ?.filter(field => field.name !== lastTenancyColumnName)
        ?.map(f => ({ name: f.name, value: f.name })) ?? []),
    ];

    const lastTenantField = table.fields?.find(
      field => field.name === lastTenancyColumnName,
    );

    // if we found the same column name in the previous table,
    // we select it as the default value.
    if (lastTenantField) {
      fieldChoices.unshift({
        name: lastTenantField.name,
        value: lastTenantField.name,
      });
    }

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
      lastTenancyColumnName = columnName;
    }
  }

  if (Object.keys(tenancyColumnNames).length === 0) {
    printHelperText(
      "Your tables do not have any multi-tenancy column. Continuing without tenancy isolation.",
    );

    return [{ type: "success" }, state];
  }

  return [{ type: "success" }, { ...state, tenancyColumnNames }];
};
