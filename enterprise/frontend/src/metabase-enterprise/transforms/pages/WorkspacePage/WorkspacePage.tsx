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
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { WorkspaceContentItem } from "metabase-types/api";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);

  const { data: transforms = [] } = useListTransformsQuery({});
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

  const workspaceTransforms = contents?.contents.transforms ?? [];

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
              <Stack>
                {workspaceTransforms.length === 0 ? null : (
                  <Stack gap="md">
                    <Stack gap={0}>
                      <Text fw={600}>{t`Workspace Transforms`}</Text>
                      {workspaceTransforms.map(
                        (transform: WorkspaceContentItem) => (
                          <Group
                            justify="flex-start"
                            align="center"
                            key={transform.id}
                            gap="sm"
                          >
                            <Icon name="sun" size={12} />
                            <Anchor
                              href={Urls.transform(transform.id)}
                              fw={500}
                            >
                              {transform.name}
                            </Anchor>
                          </Group>
                        ),
                      )}
                    </Stack>
                    <Stack
                      py="md"
                      dir="column"
                      style={{ borderTop: "1px solid var(--mb-color-border)" }}
                      gap="sm"
                    >
                      {transforms.map((transform: WorkspaceContentItem) => (
                        <Group
                          justify="flex-start"
                          align="center"
                          key={transform.id}
                          gap="sm"
                        >
                          <Icon name="sun" size={12} />
                          <Anchor href={Urls.transform(transform.id)} fw={500}>
                            {transform.name}
                          </Anchor>
                        </Group>
                      ))}
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Group>
    </Stack>
  );
}
