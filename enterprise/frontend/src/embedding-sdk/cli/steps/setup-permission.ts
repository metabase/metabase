import { SANDBOXED_GROUP_NAMES } from "../constants/config";
import { getNoTenantMessage } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { getCollectionPermissions } from "../utils/get-collection-permissions";
import { getPermissionsForGroups } from "../utils/get-permission-groups";
import { getTenancyIsolationSandboxes } from "../utils/get-tenancy-isolation-sandboxes";
import {
  cliError,
  propagateErrorResponse,
} from "../utils/propagate-error-response";
import { sampleTenantIdsFromTables } from "../utils/sample-tenancy-column-values";

export const setupPermissions: CliStepMethod = async state => {
  const { cookie = "", instanceUrl = "", tenancyColumnNames = {} } = state;

  let res;
  const collectionIds: number[] = [];

  // Create new customer collections sequentially
  try {
    for (const groupName of SANDBOXED_GROUP_NAMES) {
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

      const { id: collectionId } = (await res.json()) as { id: number };
      collectionIds.push(collectionId);
    }
  } catch (error) {
    const message = `Failed to create customer collections`;

    return [cliError(message, error), state];
  }

  // Example: { "Customer A": [3], "Customer B": [4], "Customer C": [5] }
  const jwtGroupMappings: Record<string, number[]> = {};

  try {
    // Create new permission groups
    for (const groupName of SANDBOXED_GROUP_NAMES) {
      res = await fetch(`${instanceUrl}/api/permissions/group`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: groupName }),
      });

      await propagateErrorResponse(res);

      const { id: groupId } = (await res.json()) as { id: number };

      jwtGroupMappings[groupName] = [groupId];
    }

    // Update the JWT group mappings.
    res = await fetch(`${instanceUrl}/api/setting/jwt-group-mappings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ value: jwtGroupMappings }),
    });

    await propagateErrorResponse(res);
  } catch (error) {
    const message = `Failed to define SSO group mappings`;

    return [cliError(message, error), state];
  }

  const groupIds: number[] = Object.values(jwtGroupMappings).flat();

  try {
    const options = {
      tables: state.tables ?? [],
      chosenTables: state.chosenTables ?? [],
      groupIds,
      tenancyColumnNames,
    };

    const permissionGraph = {
      groups: getPermissionsForGroups(options),
      sandboxes: getTenancyIsolationSandboxes(options),
      revision: 0,
      impersonations: [],
    };

    // Update the permissions graph with sandboxed permissions
    res = await fetch(`${instanceUrl}/api/permissions/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(permissionGraph),
    });

    await propagateErrorResponse(res);
  } catch (error) {
    const message = "Failed to update permissions";

    return [cliError(message, error), state];
  }

  try {
    const groups = getCollectionPermissions({ groupIds, collectionIds });

    // Update the permissions for sandboxed collections
    res = await fetch(`${instanceUrl}/api/collection/graph`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        groups,
        revision: 0,
        skip_graph: true,
      }),
    });

    await propagateErrorResponse(res);
  } catch (error) {
    const message = `Failed to update collection permissions`;

    return [cliError(message, error), state];
  }

  try {
    const { tenantIdsMap, unsampledTableNames } =
      await sampleTenantIdsFromTables({
        chosenTables: state.chosenTables ?? [],
        databaseId: state.databaseId ?? 0,
        tenancyColumnNames,

        cookie,
        instanceUrl,
      });

    // Warn if some of the chosen tables doesn't have any tenant.
    if (unsampledTableNames.length > 0) {
      console.log(getNoTenantMessage(unsampledTableNames));
    }

    return [{ type: "success" }, { ...state, tenantIdsMap }];
  } catch (error) {
    const message = `Failed to query tenancy column values (e.g. customer_id)`;

    return [cliError(message, error), state];
  }
};
