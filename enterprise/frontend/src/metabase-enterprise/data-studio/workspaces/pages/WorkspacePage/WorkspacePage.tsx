import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
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
  } = useWorkspace();

  const workspaceTransforms = useMemo(
    () =>
      transforms.filter((t) =>
        workspace?.contents?.transforms?.find((x) => x.id === t.id),
      ),
    [transforms, workspace],
  );

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
                <Stack gap={0}>
                  <Title order={4}>{t`Source: `}</Title>
                  <Title order={3}>
                    <code>{sourceDb?.name}</code>
                  </Title>
                </Stack>
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
                  <TransformEditor
                    source={activeTransform.source as DraftTransformSource}
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
                      {workspaceTransforms.map((transform) => (
                        <Group
                          justify="flex-start"
                          align="center"
                          key={transform.id}
                          gap="sm"
                          wrap="nowrap"
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
                        >
                          <Icon name="sun" size={12} />
                          <Ellipsified
                            style={{ cursor: "pointer" }}
                            variant="inline"
                            c={
                              activeTransform?.id === transform.id
                                ? "var(--mb-color-primary)"
                                : "text-dark"
                            }
                          >
                            {transform.name}
                          </Ellipsified>
                        </Group>
                      ))}
                    </Stack>
                  </Stack>
                )}
                <Stack py="md" dir="column" gap="sm">
                  {transforms.map((transform) => (
                    <Group
                      justify="flex-start"
                      align="center"
                      key={transform.id}
                      gap="sm"
                      wrap="nowrap"
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
                    >
                      <Icon name="sun" size={12} />
                      <Ellipsified
                        style={{
                          cursor: "pointer",
                          color: "var(--mb-color-primary)",
                        }}
                        variant="subtle"
                        c={
                          activeTransform?.id === transform.id
                            ? "var(--mb-color-brand)"
                            : "text-dark"
                        }
                      >
                        {transform.name}
                      </Ellipsified>
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
