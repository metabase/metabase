import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import {
  useGetWorkspaceQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type { DraftTransformSource, Transform } from "metabase-types/api";

import { CodeTab } from "./CodeTab/CodeTab";
import { MetabotTab } from "./MetabotTab";
import { SetupTab } from "./SetupTab";
import { TransformTab } from "./TransformTab";
import styles from "./WorkspacePage.module.css";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

function WorkspacePageContent({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const [tab, setTab] = useState<string>("setup");

  const { data: databases = { data: [] } } = useListDatabasesQuery({});

  const { data: allTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);

  const sourceDb = databases?.data.find(
    (db) => db.id === workspace?.database_id,
  );

  const transforms = useMemo(
    () =>
      allTransforms.filter((t) => {
        if (t.source_type === "python") {
          return t.source["source-database"] === sourceDb?.id;
        }
        if (t.source_type === "native") {
          return t.source.query.database === sourceDb?.id;
        }
        return false;
      }),
    [allTransforms, sourceDb],
  );

  const {
    openedTransforms,
    activeTransform,
    setActiveTransform,
    addOpenedTransform,
    removeOpenedTransform,
    setEditedTransform,
  } = useWorkspace();

  const workspaceTransforms = useMemo(
    () =>
      transforms.filter((t) =>
        workspace?.contents?.transforms?.find((x) => x.id === t.id),
      ),
    [transforms, workspace],
  );

  const handleTransformChange = useCallback(
    (source: DraftTransformSource) => {
      if (activeTransform) {
        setEditedTransform(activeTransform.id, {
          name: activeTransform.name,
          source,
          target: {
            name: activeTransform.target.name,
            type: activeTransform.target.type,
          },
        });
      }
    },
    [activeTransform, setEditedTransform],
  );

  const handleCloseClick = useCallback(
    (event: React.MouseEvent, transform: Transform, index: number) => {
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
                <Tabs.Tab value="setup">
                  <Group gap="xs" wrap="nowrap">
                    <Icon name="database" aria-hidden />
                    {t`Setup`}
                  </Group>
                </Tabs.Tab>
                {isMetabotAvailable && (
                  <Tabs.Tab value="metabot">
                    <Group gap="xs" wrap="nowrap">
                      <Icon name="message_circle" aria-hidden />
                      {t`Agent Chat`}
                    </Group>
                  </Tabs.Tab>
                )}
                {openedTransforms.map((transform, index) => (
                  <Tabs.Tab
                    key={transform.id}
                    value={String(transform.id)}
                    onClick={() => {
                      setActiveTransform(transform);
                    }}
                  >
                    <Group gap="xs" wrap="nowrap">
                      <Icon name="pivot_table" aria-hidden />
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
                    </Group>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Flex>

            <Box flex={1} mih={0}>
              <Tabs.Panel value="setup" h="100%" p="md">
                <SetupTab databaseName={sourceDb?.name} />
              </Tabs.Panel>
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
                  <TransformTab
                    transform={activeTransform}
                    onChange={handleTransformChange}
                    workspaceId={id}
                  />
                )}
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Box>
        <Box style={{ flex: "1 0 auto", width: "30%" }}>
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
              <CodeTab
                workspaceTransforms={workspaceTransforms}
                transforms={transforms}
                activeTransformId={activeTransform?.id}
                onTransformClick={(transform) => {
                  setTab(String(transform.id));
                  addOpenedTransform(transform);
                  setActiveTransform(transform);
                }}
              />
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
