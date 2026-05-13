import { Link } from "react-router";
import { t } from "ttag";

import { Card, Divider, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Database, Workspace } from "metabase-types/api";

import { DatabaseInfo } from "../../../components/DatabaseInfo";
import { getDatabasesById } from "../../../utils";

import S from "./WorkspaceItem.module.css";

export type WorkspaceItemProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceItem({
  workspace,
  availableDatabases,
}: WorkspaceItemProps) {
  const databaseById = getDatabasesById(availableDatabases);
  const hasDatabases = workspace.databases.length > 0;

  return (
    <Card
      className={S.workspaceItem}
      component={Link}
      to={Urls.workspace(workspace.id)}
      p="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="md">
        <Stack>
          <Title order={4}>{workspace.name}</Title>
          <CreatorInfo workspace={workspace} />
        </Stack>
        {hasDatabases && (
          <>
            <Divider />
            <Stack gap="sm">
              {workspace.databases.map((workspaceDatabase) => (
                <DatabaseInfo
                  key={workspaceDatabase.database_id}
                  workspaceDatabase={workspaceDatabase}
                  database={databaseById.get(workspaceDatabase.database_id)}
                />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

type CreatorInfoProps = {
  workspace: Workspace;
};

function CreatorInfo({ workspace }: CreatorInfoProps) {
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
