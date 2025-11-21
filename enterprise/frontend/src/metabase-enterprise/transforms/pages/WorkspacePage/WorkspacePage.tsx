import { t } from "ttag";

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
import {
  useGetWorkspaceContentsQuery,
  useGetWorkspaceQuery,
} from "metabase-enterprise/api";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);

  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);
  const { data: contents, isLoading: isLoadingContents } =
    useGetWorkspaceContentsQuery(id);

  if (isLoadingWorkspace || isLoadingContents) {
    return (
      <Box p="lg">
        <Text>{t`Loading...`}</Text>
      </Box>
    );
  }

  if (!workspace) {
    return (
      <Box p="lg">
        <Text>{t`Workspace not found`}</Text>
      </Box>
    );
  }

  const transforms = contents?.contents.transforms ?? [];

  return (
    <Box p="lg">
      <Group gap="xs" mb="md">
        <Icon name="chevronleft" size={12} />
        <Anchor href={Urls.workspaceList()} size="sm">
          {t`All workspaces`}
        </Anchor>
      </Group>
      <Title order={2} mb="lg">
        {workspace.name}
      </Title>
      <Title order={4} mb="md">{t`Transforms`}</Title>
      {transforms.length === 0 ? (
        <Text c="text-secondary">{t`No transforms in this workspace`}</Text>
      ) : (
        <Stack gap="md">
          {transforms.map((transform) => (
            <Card key={transform.id} p="md" shadow="none" withBorder>
              <Group justify="space-between">
                <Anchor href={Urls.transform(transform.id)} fw={500}>
                  {transform.name}
                </Anchor>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
