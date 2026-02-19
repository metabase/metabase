/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { DatabaseMultiSelect } from "metabase/common/components/DatabaseMultiSelect";
import { useToast } from "metabase/common/hooks";
import { Button, Flex, Stack, Text } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import { useUpdateTenantGroupPermissions } from "./hooks/use-update-tenant-permissions";

const supportsConnectionImpersonation = (db: Database) =>
  db.features?.includes("connection-impersonation") ?? false;

export const ConnectionImpersonationStepContent = ({
  onNext,
}: {
  onNext: () => void;
}) => {
  const [sendToast] = useToast();

  const [isUpdatingPermissions, setUpdatingPermissions] = useState(false);

  const { data: databasesResponse } = useListDatabasesQuery();
  const { updateDataAccess } = useUpdateTenantGroupPermissions();

  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );

  const hasCompatibleDatabases = useMemo(
    () => databases.some(supportsConnectionImpersonation),
    [databases],
  );

  const [selectedDatabaseIds, setSelectedDatabaseIds] = useState<DatabaseId[]>(
    [],
  );

  const handleCreateImpersonations = useCallback(async () => {
    if (selectedDatabaseIds.length === 0) {
      return;
    }

    setUpdatingPermissions(true);

    try {
      await updateDataAccess({ impersonatedDatabaseIds: selectedDatabaseIds });

      onNext();
    } catch (error) {
      const message = getErrorMessage(
        error,
        t`Failed to configure connection impersonation`,
      );

      sendToast({ icon: "warning", toastColor: "error", message });
    } finally {
      setUpdatingPermissions(false);
    }
  }, [selectedDatabaseIds, updateDataAccess, onNext, sendToast]);

  const isNextDisabled = selectedDatabaseIds.length === 0;

  if (!hasCompatibleDatabases) {
    return (
      <Stack gap="md">
        <Text size="md" c="text-secondary" lh="lg">
          {t`None of your databases support connection impersonation. Pick a different data segregation strategy in the previous step, or connect a new database in the Database settings before proceeding. Metabase connects to more than 15 popular databases.`}
        </Text>

        <Flex justify="flex-end">
          <Button
            component={Link}
            to="/admin/databases/create"
            variant="filled"
          >
            {t`Add database`}
          </Button>
        </Flex>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="md" c="text-secondary" lh="lg">
        {t`Select one or more databases to be made visible to all tenant users. Tenant users will be able to create queries on these databases with the query builder. The tenant attribute database_role will be used to manage permissions. You will specify this attribute for each tenant when you create tenants.`}
      </Text>

      <DatabaseMultiSelect
        databases={databases}
        value={selectedDatabaseIds}
        onChange={setSelectedDatabaseIds}
        isOptionDisabled={(db) => !supportsConnectionImpersonation(db)}
        disabledOptionTooltip={t`This database doesn't support connection impersonation`}
      />

      <Flex justify="flex-end">
        <Button
          variant="filled"
          disabled={isNextDisabled}
          loading={isUpdatingPermissions}
          onClick={handleCreateImpersonations}
        >
          {t`Next`}
        </Button>
      </Flex>
    </Stack>
  );
};
