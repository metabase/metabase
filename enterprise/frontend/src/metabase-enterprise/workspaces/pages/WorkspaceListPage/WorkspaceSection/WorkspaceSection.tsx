import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Card,
  Divider,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Database, Workspace } from "metabase-types/api";

import { WorkspaceDatabaseInfo } from "../../../components/WorkspaceDatabaseInfo";
import { useDeleteWorkspace } from "../../../hooks";

export type WorkspaceSectionProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceSection({
  workspace,
  availableDatabases,
}: WorkspaceSectionProps) {
  const hasDatabases = workspace.databases.length > 0;

  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack>
            <Title order={4}>{workspace.name}</Title>
            <CreatorSection workspace={workspace} />
          </Stack>
          <WorkspaceMenu workspace={workspace} />
        </Group>
        {hasDatabases && (
          <>
            <Divider />
            <Stack gap="sm">
              {workspace.databases.map((workspaceDatabase) => (
                <WorkspaceDatabaseInfo
                  key={workspaceDatabase.database_id}
                  workspaceDatabase={workspaceDatabase}
                  availableDatabases={availableDatabases}
                />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

type CreatorSectionProps = {
  workspace: Workspace;
};

function CreatorSection({ workspace }: CreatorSectionProps) {
  const timeAgo = getRelativeTime(workspace.created_at);
  const creatorName = workspace.creator?.common_name;

  return (
    <Text c="text-secondary" size="sm">
      {creatorName != null
        ? t`Created by ${creatorName} ${timeAgo}`
        : t`Created ${timeAgo}`}
    </Text>
  );
}

type WorkspaceMenuProps = {
  workspace: Workspace;
};

function WorkspaceMenu({ workspace }: WorkspaceMenuProps) {
  const { handleDelete, modalContent } = useDeleteWorkspace();

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Workspace actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component="a"
            href={`/api/ee/workspace-manager/${workspace.id}/config`}
            leftSection={<Icon name="download" />}
          >
            {t`Download config.yml`}
          </Menu.Item>
          <Menu.Item
            component={Link}
            to={Urls.workspace(workspace.id)}
            leftSection={<Icon name="pencil" />}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => handleDelete(workspace)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
