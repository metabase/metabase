import { useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Button, Card, Group, Text, Title } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { WorkspaceTable } from "./WorkspaceTable";

export function WorkspaceSettings() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: workspaces = [], error, isLoading } = useListWorkspacesQuery();

  const hasWorkspaces = workspaces.length > 0;
  const showLoadingOrError = isLoading || error != null;

  return (
    <SettingsPageWrapper>
      <CreateWorkspaceModal
        opened={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
      <Group
        justify="space-between"
        align="flex-start"
        gap="xl"
        data-testid="workspaces-settings-header"
      >
        <Box>
          <Title order={1}>{t`Workspaces`}</Title>
          <Text c="text-secondary" maw="40rem">
            {t`Give users an isolated branch to work in.`}
          </Text>
        </Box>
        <Button variant="filled" onClick={() => setIsCreateModalOpen(true)}>
          {t`Create a workspace`}
        </Button>
      </Group>
      <Card withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
        {showLoadingOrError ? (
          <Box p="xl" mih="20rem">
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Box>
        ) : hasWorkspaces ? (
          <WorkspaceTable workspaces={workspaces} />
        ) : (
          <ListEmptyState label={t`No workspaces yet`} />
        )}
      </Card>
    </SettingsPageWrapper>
  );
}
