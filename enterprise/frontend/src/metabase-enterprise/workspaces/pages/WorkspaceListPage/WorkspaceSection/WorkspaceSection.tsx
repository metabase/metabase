import { Link } from "react-router";
import { t } from "ttag";

import { Card, Divider, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Database, Workspace } from "metabase-types/api";

import { WorkspaceDatabaseInfo } from "../../../components/WorkspaceDatabaseInfo";
import { getDatabasesById } from "../../../utils";

import S from "./WorkspaceSection.module.css";

export type WorkspaceSectionProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceSection({
  workspace,
  availableDatabases,
}: WorkspaceSectionProps) {
  const databaseById = getDatabasesById(availableDatabases);
  const hasDatabases = workspace.databases.length > 0;

  return (
    <Card
      className={S.workspaceSection}
      component={Link}
      to={Urls.workspace(workspace.id)}
      p="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="md">
        <Stack>
          <Title order={4}>{workspace.name}</Title>
          <CreatorSection workspace={workspace} />
        </Stack>
        {hasDatabases && (
          <>
            <Divider />
            <Stack gap="sm">
              {workspace.databases.map((workspaceDatabase) => (
                <WorkspaceDatabaseInfo
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
