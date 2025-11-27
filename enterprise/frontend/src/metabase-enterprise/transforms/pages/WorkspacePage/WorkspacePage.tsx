import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import {
  useArchiveWorkspaceMutation,
  useGetWorkspaceQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type {
  DraftTransformSource,
  Transform,
  WorkspaceContentItem,
} from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [archiveWorkspace, { isLoading: isArchiving }] =
    useArchiveWorkspaceMutation();

  const { data: transforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);

  const handleArchiveClick = async () => {
    try {
      await archiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace archived successfully`);
      dispatch(push(Urls.workspaceList()));
    } catch (error) {
      sendErrorToast(t`Failed to archive workspace`);
    }
  };

  const workspaceTransforms = (workspace as any)?.contents?.transforms ?? [];
  const [activeTransform, setActiveTransform] = useState<
    Transform | undefined
  >();

  if (isLoadingWorkspace) {
    return (
      <Box p="lg">
        <Text>{t`Loading...`}</Text>
      </Box>
    );
  }

  if (!workspace) {
    return (
      <Box p="lg">
        <Text c="text-dark">{t`Workspace not found`}</Text>
      </Box>
    );
  }

  return (
    <Stack h="100%">
      <Group
        px="lg"
        py="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        justify="space-between"
      >
        <Title order={2}>{workspace.name}</Title>
        <Button
          leftSection={<Icon name="archive" aria-hidden />}
          onClick={handleArchiveClick}
          loading={isArchiving}
          variant="subtle"
          c="text-dark"
        >
          {t`Archive workspace`}
        </Button>
      </Group>
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
                <Tabs.Tab value="transform">{t`Transform`}</Tabs.Tab>
              </Tabs.List>
            </Box>
            <Tabs.Panel value="transform" p="md">
              {activeTransform ? (
                <TransformEditor
                  source={activeTransform.source as DraftTransformSource}
                />
              ) : (
                <Text c="text-medium">
                  {t`Select a transform on the right.`}
                </Text>
              )}
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
              <Stack h="100%">
                {workspaceTransforms.length === 0 ? null : (
                  <Stack
                    gap="md"
                    style={{
                      borderBottom: "1px solid var(--mb-color-border)",
                    }}
                  >
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
                            <Text
                              style={{ cursor: "pointer" }}
                              variant="inline"
                              onClick={() =>
                                setActiveTransform(transform as Transform)
                              }
                              c={
                                activeTransform?.id === transform.id
                                  ? "var(--mb-color-primary)"
                                  : "text-dark"
                              }
                            >
                              {transform.name}
                            </Text>
                          </Group>
                        ),
                      )}
                    </Stack>
                  </Stack>
                )}
                <Stack py="md" dir="column" gap="sm">
                  {transforms.map((transform: WorkspaceContentItem) => (
                    <Group
                      justify="flex-start"
                      align="center"
                      key={transform.id}
                      gap="sm"
                    >
                      <Icon name="sun" size={12} />
                      <Text
                        style={{
                          cursor: "pointer",
                          color: "var(--mb-color-primary)",
                        }}
                        variant="subtle"
                        onClick={() =>
                          setActiveTransform(transform as Transform)
                        }
                        c={
                          activeTransform?.id === transform.id
                            ? "var(--mb-color-brand)"
                            : "text-dark"
                        }
                      >
                        {transform.name}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Group>
    </Stack>
  );
}
