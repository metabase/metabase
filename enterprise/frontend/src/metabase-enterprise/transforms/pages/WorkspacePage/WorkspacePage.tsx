import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import {
  Anchor,
  Box,
  Card,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import {
  useGetWorkspaceContentsQuery,
  useGetWorkspaceQuery,
} from "metabase-enterprise/api";
import type { WorkspaceContentItem } from "metabase-types/api";

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
    <Stack h="100%">
      <Title
        order={2}
        px="lg"
        py="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        {workspace.name}
      </Title>
      <Group align="flex-start" gap={0} flex="1 1 auto">
        <Box
          w="70%"
          h="100%"
          style={{ borderRight: "1px solid var(--mb-color-border)" }}
        >
          <Tabs defaultValue="setup">
            <Box px="md">
              <Tabs.List>
                <Tabs.Tab value="setup">{t`Setup`}</Tabs.Tab>
              </Tabs.List>
            </Box>
            <Tabs.Panel value="setup" p="md">
              <Group gap="xs">
                <Icon name="chevronleft" size={12} />
                <Anchor href={Urls.workspaceList()} size="sm">
                  {t`All workspaces`}
                </Anchor>
              </Group>
            </Tabs.Panel>
          </Tabs>
        </Box>
        <Box style={{ flex: 1 }}>
          <Tabs defaultValue="code">
            <Box px="md">
              <Tabs.List>
                <Tabs.Tab value="code">{t`Code`}</Tabs.Tab>
              </Tabs.List>
            </Box>
            <Tabs.Panel value="code" p="md">
              {transforms.length === 0 ? (
                <Text c="text-secondary">
                  {t`No transforms in this workspace`}
                </Text>
              ) : (
                <Stack gap="md">
                  {transforms.map((transform: WorkspaceContentItem) => (
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
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Group>
    </Stack>
  );
}
