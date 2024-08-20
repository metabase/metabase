import { search } from "@inquirer/prompts";
import chalk from "chalk";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "../types/cli";
import { getPermissionGraph } from "../utils/get-permission-graph";
import { propagateErrorResponse } from "../utils/propagate-error-response";

// Name of the permission groups and collections to create.
const GROUP_NAMES = ["Customer A", "Customer B", "Customer C"];

const printWithPadding = (message: string) => console.log(`  ${message}`);

const printHelperText = (message: string) =>
  printWithPadding(chalk.gray(message));

export const setupPermissions: CliStepMethod = async state => {
  const { cookie = "", instanceUrl } = state;

  printHelperText(
    `e.g. does your table have a customer_id column to isolate tenants?`,
  );

  const hasTenancyIsolation = await toggle({
    message: `Is your tenancy isolation based on a column?`,
    default: true,
  });

  if (!hasTenancyIsolation) {
    // TODO: generate a sample Express app

    return [{ type: "success" }, state];
  }

  if (!state.chosenTables) {
    return [
      { type: "error", message: "You have not selected any tables." },
      state,
    ];
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

  let res;

  // Create new collections
  try {
    await Promise.all(
      GROUP_NAMES.map(async groupName => {
        res = await fetch(`${instanceUrl}/api/collection`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            parent_id: null,
            authority_level: null,
            color: "#509EE3",
            description: null,
            name: groupName,
          }),
        });

        await propagateErrorResponse(res);
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Failed to create sandboxed collections. Reason: ${reason}`;

    return [{ type: "error", message }, state];
  }

  // Example: { "Customer A": [3], "Customer B": [4], "Customer C": [5] }
  const jwtGroupMappings: Record<string, number[]> = {};

  // Create new permission groups and add them to the JWT group mappings.
  try {
    for (const groupName of GROUP_NAMES) {
      res = await fetch(`${instanceUrl}/api/permissions/group`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: groupName }),
      });

      await propagateErrorResponse(res);

      const { id: groupId } = (await res.json()) as { id: number };

      jwtGroupMappings[groupName] = [groupId];
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Failed to define SSO group mappings. Reason: ${reason}`;

    return [{ type: "error", message }, state];
  }

  // Update the JWT group mappings.
  res = await fetch(`${instanceUrl}/api/setting/jwt-group-mappings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ value: jwtGroupMappings }),
  });

  // Query existing permissions graph
  res = await fetch(`${instanceUrl}/api/permissions/graph/group/1`, {
    method: "GET",
    headers: { "content-type": "application/json", cookie },
  });

  await propagateErrorResponse(res);

  // Get the current permission revision number. Should be 1 by default.
  const { revision } = (await res.json()) as { revision: number };

  const groupIds: number[] = Object.values(jwtGroupMappings).flat();

  // Update the permissions graph with sandboxed permissions
  const permissionGraph = {
    ...getPermissionGraph({
      tables: state.tables ?? [],
      chosenTables: state.chosenTables,
      groupIds,
      tenancyColumnNames,
    }),
    revision,
    impersonations: [],
  };

  res = await fetch(`${instanceUrl}/api/permissions/graph`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(permissionGraph),
  });

  await propagateErrorResponse(res);

  return [{ type: "success" }, state];
};
