import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Card,
  Divider,
  Group,
  Icon,
  Menu,
  Pill,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

export type WorkspaceSectionProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceSection({
  workspace,
  availableDatabases,
}: WorkspaceSectionProps) {
  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={0}>
            <Title order={4}>{workspace.name}</Title>
            <CreatorSection workspace={workspace} />
          </Stack>
          <WorkspaceMenu workspace={workspace} />
        </Group>
        <Divider />
        <Stack gap="sm">
          {workspace.databases.map((workspaceDatabase) => (
            <DatabaseSection
              key={workspaceDatabase.database_id}
              workspaceDatabase={workspaceDatabase}
              availableDatabases={availableDatabases}
            />
          ))}
        </Stack>
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

type DatabaseSectionProps = {
  workspaceDatabase: WorkspaceDatabase;
  availableDatabases: Database[];
};

function DatabaseSection({
  workspaceDatabase,
  availableDatabases,
}: DatabaseSectionProps) {
  const database = availableDatabases.find(
    (candidate) => candidate.id === workspaceDatabase.database_id,
  );
  const databaseLabel =
    database?.name ?? t`Database ${workspaceDatabase.database_id}`;
  const schemas = workspaceDatabase.input
    .map((input) => input.schema)
    .filter((schema): schema is string => schema != null);

  return (
    <Group gap="sm" wrap="wrap">
      <Text fw="bold">{databaseLabel}</Text>
      {schemas.map((schema) => (
        <Pill key={schema}>{schema}</Pill>
      ))}
    </Group>
  );
}

type WorkspaceMenuProps = {
  workspace: Workspace;
};

function WorkspaceMenu({ workspace }: WorkspaceMenuProps) {
  return (
    <Menu>
      <Menu.Target>
        <ActionIcon size="sm">
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
      </Menu.Dropdown>
    </Menu>
  );
}
