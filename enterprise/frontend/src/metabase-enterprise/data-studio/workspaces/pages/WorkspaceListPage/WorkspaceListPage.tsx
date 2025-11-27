import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Anchor, Box, Card, Group, Stack, Text, Title } from "metabase/ui";
import { useGetWorkspacesQuery } from "metabase-enterprise/api";

export function WorkspaceListPage() {
  const { data: workspacesData, isLoading } = useGetWorkspacesQuery();

  if (isLoading) {
    return (
      <Box p="lg">
        <Text>{t`Loading...`}</Text>
      </Box>
    );
  }

  const workspaces = workspacesData?.items ?? [];

  return (
    <Box p="lg">
      <Title order={2} mb="lg">{t`Workspaces`}</Title>
      {workspaces.length === 0 ? (
        <Text c="text-secondary">{t`No workspaces yet`}</Text>
      ) : (
        <Stack gap="md">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} p="md" shadow="none" withBorder>
              <Group justify="space-between">
                <Anchor
                  component={ForwardRefLink}
                  to={Urls.dataStudioWorkspace(workspace.id)}
                  fw={500}
                >
                  {workspace.name}
                </Anchor>
                <Text c="text-secondary" size="sm">
                  {t`Created ${new Date(workspace.created_at).toLocaleDateString()}`}
                </Text>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
