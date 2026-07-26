import { useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Button, Card, Group, Text, Title } from "metabase/ui";
import { useListWorktreesQuery } from "metabase-enterprise/api";

import { CreateWorktreeModal } from "./CreateWorktreeModal";
import { WorktreeTable } from "./WorktreeTable";

export function WorktreeSettings() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: worktrees = [], error, isLoading } = useListWorktreesQuery();

  const hasWorktrees = worktrees.length > 0;
  const showLoadingOrError = isLoading || error != null;

  return (
    <SettingsPageWrapper>
      <CreateWorktreeModal
        opened={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
      <Group
        justify="space-between"
        align="flex-start"
        gap="xl"
        data-testid="worktrees-settings-header"
      >
        <Box>
          <Title order={1}>{t`Worktrees`}</Title>
          <Text c="text-secondary" maw="40rem">
            {t`Give users an isolated branch to work in.`}
          </Text>
        </Box>
        <Button variant="filled" onClick={() => setIsCreateModalOpen(true)}>
          {t`Create a worktree`}
        </Button>
      </Group>
      <Card withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
        {showLoadingOrError ? (
          <Box p="xl" mih="20rem">
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Box>
        ) : hasWorktrees ? (
          <WorktreeTable worktrees={worktrees} />
        ) : (
          <ListEmptyState label={t`No worktrees yet`} />
        )}
      </Card>
    </SettingsPageWrapper>
  );
}
