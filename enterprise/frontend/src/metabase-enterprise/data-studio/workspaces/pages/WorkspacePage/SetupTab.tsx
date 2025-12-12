import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";
import type { WorkspaceId } from "metabase-types/api";

import { SetupLog } from "./SetupLog";

interface SetupTabProps {
  databaseName?: string;
  workspaceId: WorkspaceId;
}

export const SetupTab = ({ databaseName, workspaceId }: SetupTabProps) => {
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
        <Text>
          <code>{databaseName}</code>
        </Text>

        <Text c="text-light" size="sm">
          {t`Data warehouse selection is locked after editing or timeout`}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text fw="bold">{t`Setup log`}</Text>

        <SetupLog
          key={workspaceId} // avoid showing status of other workspaces (forces RTK query hook remount)
          workspaceId={workspaceId}
        />
      </Stack>
    </Stack>
  );
};
