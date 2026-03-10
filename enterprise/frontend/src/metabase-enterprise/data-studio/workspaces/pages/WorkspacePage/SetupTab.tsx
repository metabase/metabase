import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Select, Stack, Text, Title } from "metabase/ui";
import {
  useGetWorkspaceAllowedDatabasesQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api/workspace";
import type { DatabaseId, Workspace } from "metabase-types/api";

import { isWorkspaceUninitialized } from "../../utils";

import { SetupLog } from "./SetupLog";
import type { SetupStatus } from "./useWorkspaceData";

interface SetupTabProps {
  databaseId?: DatabaseId | null;
  workspace: Workspace;
  setupStatus: SetupStatus;
}

export const SetupTab = ({
  databaseId,
  workspace,
  setupStatus,
}: SetupTabProps) => {
  const {
    data: allowedDatabases,
    isLoading,
    error,
  } = useGetWorkspaceAllowedDatabasesQuery();
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const workspaceId = workspace.id;

  const handleDatabaseChange = useCallback(
    async (value: string) => {
      const newDatabaseId = Number(value);
      if (newDatabaseId !== databaseId) {
        try {
          await updateWorkspace({
            id: workspaceId,
            database_id: newDatabaseId,
          }).unwrap();
          sendSuccessToast(t`Successfully updated workspace database`);
        } catch (error) {
          sendErrorToast(t`Failed to update workspace database`);
        }
      }
    },
    [
      databaseId,
      workspaceId,
      updateWorkspace,
      sendErrorToast,
      sendSuccessToast,
    ],
  );

  const databaseOptions = useMemo(
    () =>
      allowedDatabases?.databases
        ?.filter((db) => db.enabled)
        ?.map((db) => ({
          value: db.id.toString(),
          label: db.name,
        })) ?? [],
    [allowedDatabases?.databases],
  );

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={3}>{t`Workspace Setup`}</Title>

        <Text c="text-secondary">
          {t`Configure your data warehouse connection for this workspace`}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text fw="bold">{t`Data warehouse`}</Text>

        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <Select
            data={databaseOptions}
            value={databaseId?.toString() ?? ""}
            onChange={handleDatabaseChange}
            placeholder={
              allowedDatabases != null && databaseOptions.length === 0
                ? t`No database supports workspaces`
                : t`Select a database`
            }
            disabled={!isWorkspaceUninitialized(workspace)}
            maw="20rem"
          />
        </LoadingAndErrorWrapper>

        <Text c="text-tertiary" size="sm">
          {t`Data warehouse selection is locked after adding transforms to the workspace`}
        </Text>
      </Stack>

      {!isWorkspaceUninitialized(workspace) && (
        <Stack gap="xs">
          <Text fw="bold">{t`Setup log`}</Text>

          {setupStatus && <SetupLog setupStatus={setupStatus} />}
        </Stack>
      )}
    </Stack>
  );
};
