import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import {
  Anchor,
  Box,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useGetWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <Card key={workspace.id} p="md" shadow="none" withBorder>
      <Group justify="space-between">
        <Anchor
          component={ForwardRefLink}
          to={Urls.dataStudioWorkspace(workspace.id)}
          fw={500}
        >
          {workspace.name}
        </Anchor>
        {workspace.created_at && (
          <Text c="text-secondary" size="sm">
            {t`Created ${new Date(workspace.created_at).toLocaleDateString()}`}
          </Text>
        )}
      </Group>
    </Card>
  );
}

export function WorkspaceListPage() {
  const { data: workspacesData, error, isLoading } = useGetWorkspacesQuery();

  const workspaces = useMemo(
    () => workspacesData?.items ?? [],
    [workspacesData],
  );

  const activeWorkspaces = useMemo(
    () => workspaces.filter((w) => !w.archived),
    [workspaces],
  );

  const archivedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.archived),
    [workspaces],
  );

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Box data-testid="workspaces-page" p="lg">
      {workspaces.length === 0 ? (
        <Text c="text-secondary">{t`No workspaces yet`}</Text>
      ) : (
        <Stack gap="xl">
          <Stack gap="md">
            <Title order={4} display="flex" style={{ alignItems: "center" }}>
              <Icon mr="sm" name="check" c="success" />
              {t`Active`}
            </Title>
            {activeWorkspaces.length === 0 ? (
              <Text c="text-secondary">{t`No active workspaces`}</Text>
            ) : (
              <Stack gap="md">
                {activeWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </Stack>
            )}
          </Stack>

          {archivedWorkspaces.length > 0 && (
            <Stack gap="md">
              <Title order={4} display="flex" style={{ alignItems: "center" }}>
                <Icon mr="sm" name="archive" c="text-light" />
                {t`Archived`}
              </Title>
              <Stack gap="md">
                {archivedWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </Stack>
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  );
}
