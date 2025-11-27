import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
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

import { MetabotTab } from "./MetabotTab";
import { TransformEditor } from "./TransformEditor";
import styles from "./WorkspacePage.module.css";
import {
  WorkspaceProvider,
  type WorkspaceTransform,
  useWorkspace,
} from "./WorkspaceProvider";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};
function WorkspacePageContent({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [archiveWorkspace, { isLoading: isArchiving }] =
    useArchiveWorkspaceMutation();
  const [tab, setTab] = useState<string>("setup");

  const { data: allTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);
  const transforms = useMemo(
    () =>
      allTransforms.filter(
        (t) => t.source_type === "native" || t.source_type === "python",
      ),
    [allTransforms],
  );

  const {
    openedTransforms,
    activeTransform,
    setActiveTransform,
    addOpenedTransform,
    removeOpenedTransform,
  } = useWorkspace();

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

  const handleCloseClick = useCallback(
    (event: React.MouseEvent, transform: WorkspaceTransform, index: number) => {
      event.stopPropagation();

      const isActive = activeTransform?.id === transform.id;
      const remaining = openedTransforms.filter(
        (item) => item.id !== transform.id,
      );

      removeOpenedTransform(transform.id);

      if (!isActive) {
        return;
      }

      const fallback = remaining[index - 1] ?? remaining[index] ?? undefined;
      setActiveTransform(fallback);

      if (fallback) {
        setTab(String(fallback.id));
      } else {
        setTab("setup");
      }
    },
    [
      activeTransform,
      removeOpenedTransform,
      setActiveTransform,
      setTab,
      openedTransforms,
    ],
  );

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
    <Stack h="100%" gap={0}>
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
      <Group align="flex-start" gap={0} flex="1 1 auto" wrap="nowrap">
        <Box
          w="70%"
          h="100%"
          style={{ borderRight: "1px solid var(--mb-color-border)" }}
          pos="relative"
        >
          <Tabs
            defaultValue="setup"
            display="flex"
            h="100%"
            style={{ flexDirection: "column" }}
            value={tab}
            onChange={(tab) => {
              if (tab) {
                setTab(tab);
              }
              if (tab === "setup" || (tab === "metabot" && activeTransform)) {
                setActiveTransform(undefined);
              }
            }}
          >
            <Flex
              wrap="nowrap"
              flex="0 0 auto"
              px="md"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Tabs.List className={styles.tabsPanel}>
                <Tabs.Tab value="setup">{t`Setup`}</Tabs.Tab>
                {isMetabotAvailable && (
                  <Tabs.Tab value="metabot">{t`Metabot`}</Tabs.Tab>
                )}
                {openedTransforms.map((transform, index) => (
                  <Tabs.Tab
                    key={transform.id}
                    value={String(transform.id)}
                    onClick={() => {
                      setActiveTransform(transform);
                    }}
                  >
                    {transform.name}
                    <ActionIcon size="1rem" p="0" ml="xs">
                      <Icon
                        name="close"
                        size={10}
                        aria-hidden
                        onClick={(event) =>
                          handleCloseClick(event, transform, index)
                        }
                      />
                    </ActionIcon>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Flex>

            <Box flex={1} mih={0}>
              {isMetabotAvailable && (
                <Tabs.Panel value="metabot" h="100%">
                  <MetabotTab />
                </Tabs.Panel>
              )}

              <Tabs.Panel value={String(activeTransform?.id)} h="100%">
                {openedTransforms.length === 0 || !activeTransform ? (
                  <Text c="text-medium">
                    {t`Select a transform on the right.`}
                  </Text>
                ) : (
                  <TransformEditor
                    source={activeTransform.source as DraftTransformSource}
                  />
                )}
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Box>
        <Box style={{ flex: "1 0 auto" }}>
          <Tabs defaultValue="code">
            <Box
              px="md"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Tabs.List className={styles.tabsPanel}>
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
                            wrap="nowrap"
                          >
                            <Icon name="sun" size={12} />
                            <Text
                              style={{ cursor: "pointer" }}
                              variant="inline"
                              onClick={() => {
                                setTab(String(transform.id));
                                const workspaceTransform: WorkspaceTransform = {
                                  id: transform.id as number,
                                  name: transform.name as string,
                                  source: (transform as Transform).source,
                                };

                                addOpenedTransform(workspaceTransform);
                                setActiveTransform(workspaceTransform);
                              }}
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
                      wrap="nowrap"
                    >
                      <Icon name="sun" size={12} />
                      <Text
                        style={{
                          cursor: "pointer",
                          color: "var(--mb-color-primary)",
                        }}
                        variant="subtle"
                        onClick={() => {
                          setTab(String(transform.id));
                          const availableTransform: WorkspaceTransform = {
                            id: transform.id as number,
                            name: transform.name as string,
                            source: (transform as Transform).source,
                          };

                          addOpenedTransform(availableTransform);
                          setActiveTransform(availableTransform);
                        }}
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

export const WorkspacePage = ({ params }: WorkspacePageProps) => {
  return (
    <WorkspaceProvider>
      <WorkspacePageContent params={params} />
    </WorkspaceProvider>
  );
};
