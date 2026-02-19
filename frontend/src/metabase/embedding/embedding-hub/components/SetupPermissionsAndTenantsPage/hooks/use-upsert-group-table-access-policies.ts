import { useCallback, useState } from "react";
import { t } from "ttag";

import { tableApi, useListGroupTableAccessPoliciesQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";

import type { TableColumnSelection } from "../RlsDataSelector";

import { useUpdateAllTenantUsersGroupPermissions } from "./use-update-all-tenant-users-group-permissions";

interface UseUpsertGroupTableAccessPoliciesProps {
  tableColumnSelections: TableColumnSelection[];
}

/**
 * Creates group table access policies (sandboxes)
 * for the given table and column selections.
 */
export const useUpsertGroupTableAccessPolicies = ({
  tableColumnSelections,
}: UseUpsertGroupTableAccessPoliciesProps) => {
  const dispatch = useDispatch();

  const [isCreatingPolicy, setIsCreatingPolicy] = useState(false);

  const { updateDataAccess, tenantUsersGroupId, isReady } =
    useUpdateAllTenantUsersGroupPermissions();

  const { data: existingPolicies, isLoading: isLoadingPolicies } =
    useListGroupTableAccessPoliciesQuery(
      tenantUsersGroupId ? { group_id: tenantUsersGroupId } : undefined,
      { skip: !tenantUsersGroupId },
    );

  const handleUpsertPolicies = useCallback(async () => {
    if (!tenantUsersGroupId) {
      throw new Error(
        t`Could not find the tenant users group. Please enable tenants first.`,
      );
    }

    try {
      setIsCreatingPolicy(true);

      const nextPolicies = await Promise.all(
        tableColumnSelections.map(async (selection) => {
          if (selection.tableId === null || selection.columnId === null) {
            return null;
          }

          const { data: table } = await dispatch(
            tableApi.endpoints.getTable.initiate({ id: selection.tableId }),
          );

          if (!table) {
            return null;
          }

          const existingPolicy = existingPolicies?.find(
            (policy) => policy.table_id === selection.tableId,
          );

          return {
            tableId: table.id,
            databaseId: table.db_id,
            schemaName: table.schema ?? "",
            filterFieldId: selection.columnId,

            // If existing policy is found, this updates
            // the policy rather than creating a new one.
            ...(existingPolicy && { id: existingPolicy.id }),
          };
        }),
      );

      const sandboxedTables = nextPolicies.filter((entry) => entry != null);
      await updateDataAccess({ sandboxedTables });
    } finally {
      setIsCreatingPolicy(false);
    }
  }, [
    dispatch,
    tenantUsersGroupId,
    tableColumnSelections,
    existingPolicies,
    updateDataAccess,
  ]);

  return {
    handleUpsertPolicies,
    isCreatingPolicy,
    isLoadingPolicies,
    isReady,
    existingPolicies,
  };
};
