import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Group, Icon, Stack, Title } from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceItem } from "./WorkspaceItem";

type WorkspaceSectionProps = {
  workspaces: Workspace[];
};

export function WorkspaceSection({ workspaces }: WorkspaceSectionProps) {
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  const isEmpty = workspaces.length === 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>{t`Active workspaces`}</Title>
        {!isEmpty && (
          <Button leftSection={<Icon name="add" />} onClick={openCreateModal}>
            {t`Create`}
          </Button>
        )}
      </Group>
      {isEmpty ? (
        <WorkspaceEmptyState onCreate={openCreateModal} />
      ) : (
        <Stack>
          {workspaces.map((workspace) => (
            <WorkspaceItem key={workspace.id} workspace={workspace} />
          ))}
        </Stack>
      )}
      <CreateWorkspaceModal
        opened={createModalOpened}
        onClose={closeCreateModal}
        onCreate={closeCreateModal}
      />
    </Stack>
  );
}
