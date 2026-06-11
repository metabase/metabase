import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Title,
} from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";
import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";

const CONFIG_FILENAME = "config.yml";

export type WorkspaceItemProps = {
  workspace: Workspace;
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  return (
    <Card
      role="region"
      aria-label={workspace.name}
      data-testid="workspace-item"
      p="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" wrap="nowrap">
        <Title order={3}>{workspace.name}</Title>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon aria-label={t`Workspace options`}>
              <FixedSizeIcon name="ellipsis" aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              component="a"
              href={`/api/ee/workspace-manager/${workspace.id}/config`}
              download={CONFIG_FILENAME}
              leftSection={<FixedSizeIcon name="download" aria-hidden />}
              onClick={() =>
                trackWorkspaceConfigDownloaded({ workspaceId: workspace.id })
              }
            >
              {t`Download ${CONFIG_FILENAME}`}
            </Menu.Item>
            <Menu.Item
              leftSection={<FixedSizeIcon name="trash" aria-hidden />}
              onClick={openDelete}
            >
              {t`Delete`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <DeleteWorkspaceModal
        workspace={workspace}
        opened={isDeleteOpen}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
    </Card>
  );
}
