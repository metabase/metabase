import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
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
} from "metabase/ui";
import {
  useGetWorkspaceQuery,
  useGetWorkspaceTablesQuery,
  useListTransformsQuery,
  useMergeWorkspaceMutation,
  useUpdateWorkspaceNameMutation,
} from "metabase-enterprise/api";
import { PaneHeaderInput } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { NAME_MAX_LENGTH } from "metabase-enterprise/transforms/constants";

import { AddTransformMenu } from "./AddTransformMenu";
import { CodeTab } from "./CodeTab/CodeTab";
import { DataTab, DataTabSidebar } from "./DataTab";
import { MetabotTab } from "./MetabotTab";
import { SetupTab } from "./SetupTab";
import { TransformTab } from "./TransformTab";
import styles from "./WorkspacePage.module.css";
import {
  type EditedTransform,
  type OpenTable,
  WorkspaceProvider,
  type WorkspaceTab,
  useWorkspace,
} from "./WorkspaceProvider";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

function WorkspacePageContent({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const [tab, setTab] = useState<string>("setup");

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const { data: databases = { data: [] } } = useListDatabasesQuery({});

  const { data: allTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);
  const { data: workspaceTables = { inputs: [], outputs: [] } } =
    useGetWorkspaceTablesQuery(id);

  const [mergeWorkspace, { isLoading: isMerging }] =
    useMergeWorkspaceMutation();

  const [updateWorkspaceName] = useUpdateWorkspaceNameMutation();

  const sourceDb = databases?.data.find(
    (db) => db.id === workspace?.database_id,
  );

  const dbTransforms = useMemo(
    () =>
      allTransforms.filter((t) => {
        // TODO: @uladzimirdev add guards
        if (t.source_type === "python") {
          return (
            "source-database" in t.source &&
            t.source["source-database"] === sourceDb?.id
          );
        }
        if (t.source_type === "native") {
          return (
            "query" in t.source && t.source.query.database === sourceDb?.id
          );
        }
        return false;
      }),
    [allTransforms, sourceDb],
  );

  const {
    openedTabs,
    activeTab,
    activeTransform,
    activeEditedTransform,
    activeTable,
    setActiveTab,
    addOpenedTab,
    removeOpenedTab,
    setOpenedTabs,
    addOpenedTransform,
    patchEditedTransform,
    hasUnsavedChanges,
  } = useWorkspace();

  const workspaceTransforms = useMemo(
    () => workspace?.contents?.transforms ?? [],
    [workspace],
  );

  useEffect(() => {
    if (activeTab) {
      setTab(activeTab.id);
    }
  }, [id, activeTab, setTab]);

  const tabsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabsListRef.current && tab) {
      const activeTabElement = tabsListRef.current.querySelector(
        `[data-active="true"]`,
      ) as HTMLElement;

      if (activeTabElement) {
        activeTabElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [tab]);

  const handleTransformChange = useCallback(
    (patch: Partial<EditedTransform>) => {
      patchEditedTransform(checkNotNull(activeTransform).id, patch);
    },
    [activeTransform, patchEditedTransform],
  );

  const handleTabClose = useCallback(
    (event: React.MouseEvent, tab: WorkspaceTab, index: number) => {
      event.stopPropagation();

      const isActive =
        (tab.type === "transform" &&
          activeTransform?.id === tab.transform.id) ||
        (tab.type === "table" && activeTable?.tableId === tab.table.tableId);
      const remaining = openedTabs.filter((item) => item.id !== tab.id);

      removeOpenedTab(tab.id);

      if (!isActive) {
        return;
      }

      // Prefer previous tab, otherwise use next tab (which is now at the same index after filtering)
      const fallback = remaining[index - 1] ?? remaining[index] ?? undefined;

      if (fallback) {
        setActiveTab(fallback);
        setTab(fallback.id);
      } else {
        setActiveTab(undefined);
        setTab("setup");
      }
    },
    [
      activeTransform,
      activeTable,
      removeOpenedTab,
      setActiveTab,
      setTab,
      openedTabs,
    ],
  );

  const handleMergeWorkspace = useCallback(async () => {
    try {
      const response = await mergeWorkspace(id).unwrap();

      if (response.errors && response.errors.length > 0) {
        sendErrorToast(
          t`Failed to merge workspace: ${response.errors.map((e) => e.error).join(", ")}`,
        );
        return;
      }
      dispatch(push(Urls.transformList()));
    } catch (error) {
      sendErrorToast(t`Failed to merge workspace`);
    }
  }, [id, mergeWorkspace, sendErrorToast, dispatch]);

  const handleWorkspaceNameChange = useCallback(
    async (newName: string) => {
      if (!workspace || newName.trim() === workspace.name.trim()) {
        return;
      }

      try {
        await updateWorkspaceName({ id, name: newName.trim() }).unwrap();
      } catch (error) {
        sendErrorToast(t`Failed to update workspace name`);
      }
    },
    [workspace, id, updateWorkspaceName, sendErrorToast],
  );

  const handleTableSelect = useCallback(
    (table: OpenTable) => {
      const tableTab: WorkspaceTab = {
        id: `table-${table.tableId}`,
        name: table.schema ? `${table.schema}.${table.name}` : table.name,
        type: "table",
        table,
      };
      addOpenedTab(tableTab);
    },
    [addOpenedTab],
  );

  const handleTabDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = event.active.id;
      const overId = event.over?.id;
      if (typeof activeId === "string" && typeof overId === "string") {
        const activeIndex = openedTabs.findIndex(({ id }) => id === activeId);
        const overIndex = openedTabs.findIndex(({ id }) => id === overId);
        const reorderedTabs = arrayMove(openedTabs, activeIndex, overIndex);
        setOpenedTabs(reorderedTabs);

        // Activate the dragged tab after reordering
        const draggedTab = reorderedTabs.find((tab) => tab.id === activeId);
        if (draggedTab) {
          setActiveTab(draggedTab);
        }
      }
    },
    [openedTabs, setOpenedTabs, setActiveTab],
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
        px="md"
        py="sm"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        justify="space-between"
      >
        <Flex gap="xs" align="center">
          <Icon name="git_branch" size="1rem" aria-hidden />
          <PaneHeaderInput
            initialValue={workspace.name}
            placeholder={t`Workspace name`}
            maxLength={NAME_MAX_LENGTH}
            onChange={handleWorkspaceNameChange}
          />
        </Flex>
        <Button
          variant="filled"
          onClick={handleMergeWorkspace}
          loading={isMerging}
          disabled={hasUnsavedChanges() || workspaceTransforms.length === 0}
          size="xs"
        >
          {t`Merge`}
        </Button>
      </Group>

      <Group
        align="flex-start"
        gap={0}
        flex="1 1 auto"
        wrap="nowrap"
        style={{ overflow: "hidden" }}
      >
        <Box
          w="70%"
          h="100%"
          style={{
            borderRight: "1px solid var(--mb-color-border)",
          }}
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
              if (
                tab === "setup" ||
                (tab === "metabot" && (activeTransform || activeTable))
              ) {
                setActiveTab(undefined);
              }
            }}
          >
            <Flex
              wrap="nowrap"
              flex="0 0 auto"
              px="md"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <DndContext
                onDragEnd={handleTabDragEnd}
                modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
                sensors={[pointerSensor]}
              >
                <SortableContext
                  items={openedTabs}
                  strategy={horizontalListSortingStrategy}
                >
                  <Tabs.List ref={tabsListRef} className={styles.tabsPanel}>
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

                    {openedTabs.map((tab, index) => (
                      <Sortable
                        id={tab.id}
                        as="div"
                        key={tab.id}
                        draggingStyle={{ opacity: 0.5 }}
                      >
                        <Tabs.Tab
                          draggable
                          key={tab.id}
                          value={tab.id}
                          onClick={() => {
                            setActiveTab(tab);
                          }}
                        >
                          <Group gap="xs" wrap="nowrap">
                            <Icon
                              name={
                                tab.type === "transform"
                                  ? "pivot_table"
                                  : "table"
                              }
                              aria-hidden
                            />
                            {tab.name}
                            <ActionIcon size="1rem" p="0" ml="xs">
                              <Icon
                                name="close"
                                size={10}
                                aria-hidden
                                onClick={(event) =>
                                  handleTabClose(event, tab, index)
                                }
                              />
                            </ActionIcon>
                          </Group>
                        </Tabs.Tab>
                      </Sortable>
                    ))}
                  </Tabs.List>
                </SortableContext>
              </DndContext>
            </Flex>

            <Box
              flex={1}
              mih={0}
              style={{
                overflow: tab === "metabot" ? "auto" : undefined,
              }}
            >
              <Tabs.Panel value="setup" h="100%" p="md">
                <SetupTab databaseName={sourceDb?.name} />
              </Tabs.Panel>

              {isMetabotAvailable && (
                <Tabs.Panel
                  value="metabot"
                  h="100%"
                  mah="100%"
                  pos="relative"
                  style={{ overflow: "auto" }}
                >
                  <MetabotTab />
                </Tabs.Panel>
              )}

              <Tabs.Panel value={`table-${activeTable?.tableId}`} h="100%">
                {!activeTable ? null : (
                  <DataTab
                    databaseId={workspace?.database_id ?? null}
                    tableId={activeTable.tableId}
                  />
                )}
              </Tabs.Panel>

              <Tabs.Panel value={`transform-${activeTransform?.id}`} h="100%">
                {openedTabs.length === 0 ||
                !activeTransform ||
                !activeEditedTransform ? (
                  <Text c="text-medium">
                    {t`Select a transform on the right.`}
                  </Text>
                ) : (
                  <TransformTab
                    databaseId={checkNotNull(workspace.database_id)}
                    transform={activeTransform}
                    editedTransform={activeEditedTransform}
                    workspaceId={id}
                    workspaceTransforms={workspaceTransforms}
                    onChange={handleTransformChange}
                    onOpenTransform={(transformId) =>
                      setTab(String(transformId))
                    }
                  />
                )}
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Box>

        <Box style={{ flex: "1 0 auto", width: "30%" }}>
          <Tabs defaultValue="code">
            <Flex
              px="md"
              align="center"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Tabs.List className={styles.tabsPanel}>
                <Tabs.Tab value="code">{t`Code`}</Tabs.Tab>
                <Tabs.Tab value="data">{t`Data`}</Tabs.Tab>
              </Tabs.List>
              {sourceDb && (
                <AddTransformMenu
                  databaseId={sourceDb.id}
                  workspaceId={id}
                  onCreate={(transform) => {
                    addOpenedTransform(transform);
                  }}
                />
              )}
            </Flex>
            <Tabs.Panel value="code" p="md">
              <CodeTab
                activeTransformId={activeTransform?.id}
                transforms={dbTransforms}
                workspaceId={workspace.id}
                workspaceTransforms={workspaceTransforms}
                onTransformClick={(transform) => {
                  addOpenedTransform(transform);
                }}
              />
            </Tabs.Panel>
            <Tabs.Panel value="data" p="md">
              <DataTabSidebar
                tables={workspaceTables}
                workspaceTransforms={workspaceTransforms}
                dbTransforms={dbTransforms}
                selectedTableId={activeTable?.tableId}
                onTransformClick={(transform) => {
                  addOpenedTransform(transform);
                }}
                onTableSelect={handleTableSelect}
              />
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Group>
    </Stack>
  );
}

export const WorkspacePage = ({ params }: WorkspacePageProps) => {
  const workspaceId = Number(params.workspaceId);

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspacePageContent params={params} />
    </WorkspaceProvider>
  );
};
