import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Select, Stack, Text, Title } from "metabase/ui";
import {
  useGetWorkspaceAllowedDatabasesQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api/workspace";
import type { Workspace } from "metabase-types/api";

import { isWorkspaceUninitialized } from "../../utils";

import { SetupLog } from "./SetupLog";

interface SetupTabProps {
  databaseId?: number;
  workspace: Workspace;
}

export const SetupTab = ({ databaseId, workspace }: SetupTabProps) => {
  const { data: allowedDatabases, isLoading } =
    useGetWorkspaceAllowedDatabasesQuery();
  const [updateWorkspace, { isLoading: isUpdating }] =
    useUpdateWorkspaceMutation();
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

  const databaseOptions =
    allowedDatabases?.databases
      ?.filter((db) => db.supported)
      ?.map((db) => ({
        value: db.id.toString(),
        label: db.name,
      })) ?? [];

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={3}>{t`Workspace Setup`}</Title>

        <Text c="text-medium">
          {t`Configure your data warehouse connection for this workspace`}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text fw="bold">{t`Data warehouse`}</Text>
        {isLoading ? (
          <Text>{t`Loading databases...`}</Text>
        ) : (
          <Select
            data={databaseOptions}
            value={databaseId?.toString() ?? ""}
            onChange={handleDatabaseChange}
            placeholder={t`Select a database`}
            disabled={!isWorkspaceUninitialized(workspace)}
            maw="20rem"
          />
        )}

        <Text c="text-light" size="sm">
          {t`Data warehouse selection is locked after adding transforms to the workspace`}
        </Text>
      </Stack>

      {!isWorkspaceUninitialized(workspace) && (
        <Stack gap="xs">
          <Text fw="bold">{t`Setup log`}</Text>

          <SetupLog
            key={workspaceId} // avoid showing status of other workspaces (forces RTK query hook remount)
            workspaceId={workspaceId}
          />
        </Stack>
      )}
    </Stack>
  );
};
