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
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
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
import { RunWorkspaceMenu } from "metabase-enterprise/data-studio/workspaces/components/RunWorkspaceMenu/RunWorkspaceMenu";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks/use-metabot-agent";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";
import {
  type MetabotState,
  metabotActions,
} from "metabase-enterprise/metabot/state/reducer";
import { getMetabot } from "metabase-enterprise/metabot/state/selectors";
import { NAME_MAX_LENGTH } from "metabase-enterprise/transforms/constants";
import type { DraftTransformSource, Transform } from "metabase-types/api";

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

type MetabotConversationSnapshot = Pick<
  MetabotState,
  | "messages"
  | "history"
  | "state"
  | "reactions"
  | "activeToolCalls"
  | "errorMessages"
  | "conversationId"
>;

function WorkspacePageContent({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const dispatch = useDispatch();
  const metabotState = useSelector(getMetabot as any) as MetabotState;
  const { sendErrorToast } = useMetadataToasts();
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const [tab, setTab] = useState<string>("setup");

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const metabotStateRef = useRef<MetabotState>(metabotState);
  useEffect(() => {
    metabotStateRef.current = metabotState;
  }, [metabotState]);
  const metabotSnapshots = useRef<Map<number, MetabotConversationSnapshot>>(
    new Map(),
  );

  const { data: databases = { data: [] } } = useListDatabasesQuery({});

  const { data: allTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);
  useRegisterMetabotContextProvider(async () => {
    if (!workspace?.database_id) {
      return;
    }
    return { default_database_id: workspace.database_id };
  }, [workspace?.database_id]);
  const { data: workspaceTables = { inputs: [], outputs: [] } } =
    useGetWorkspaceTablesQuery(id);
  const { navigateToPath, setNavigateToPath } = useMetabotReactions();
  const {
    resetConversation: resetMetabotConversation,
    visible: isMetabotVisible,
  } = useMetabotAgent();

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
    setActiveTable,
    setActiveTransform,
    addOpenedTab,
    removeOpenedTab,
    setOpenedTabs,
    addOpenedTransform,
    patchEditedTransform,
    hasUnsavedChanges,
  } = useWorkspace();
  const [metabotContextTransform, setMetabotContextTransform] = useState<
    Transform | undefined
  >();
  const [metabotContextSource, setMetabotContextSource] = useState<
    DraftTransformSource | undefined
  >();

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

  useEffect(() => {
    if (
      metabotContextTransform &&
      !openedTabs.some(
        (tab) =>
          tab.type === "transform" &&
          tab.transform.id === metabotContextTransform.id,
      )
    ) {
      setMetabotContextTransform(undefined);
      setMetabotContextSource(undefined);
    }
  }, [openedTabs, metabotContextTransform]);

  useEffect(() => {
    const snapshots = metabotSnapshots.current;
    const snapshot = snapshots.get(id);
    if (snapshot) {
      dispatch(metabotActions.setConversationSnapshot(snapshot));
    } else {
      resetMetabotConversation();
    }

    return () => {
      snapshots.set(id, {
        messages: metabotStateRef.current.messages,
        history: metabotStateRef.current.history,
        state: metabotStateRef.current.state,
        reactions: metabotStateRef.current.reactions,
        activeToolCalls: metabotStateRef.current.activeToolCalls,
        errorMessages: metabotStateRef.current.errorMessages,
        conversationId: metabotStateRef.current.conversationId,
      });
      resetMetabotConversation();
    };
  }, [id, dispatch, resetMetabotConversation]);

  useEffect(() => {
    if (isMetabotAvailable && isMetabotVisible) {
      setTab("metabot");
      setActiveTab(undefined);
    }
  }, [isMetabotAvailable, isMetabotVisible, setActiveTab]);

  useEffect(() => {
    if (!navigateToPath) {
      return;
    }

    const transformIdFromPath = (() => {
      const match = navigateToPath.match(/\/transform\/(\d+)/);
      const extracted = Urls.extractEntityId(navigateToPath);
      const idString = match?.[1] ?? (extracted ? String(extracted) : null);
      const parsed = idString ? Number(idString) : NaN;
      return Number.isFinite(parsed) ? parsed : undefined;
    })();

    if (transformIdFromPath != null) {
      const targetTransform =
        workspaceTransforms.find((t) => t.id === transformIdFromPath) ||
        allTransforms.find((t) => t.id === transformIdFromPath);

      if (targetTransform) {
        addOpenedTransform(targetTransform);
        setActiveTransform(targetTransform);
        setNavigateToPath(null);
        return;
      }
    }

    dispatch(push(navigateToPath));
    setNavigateToPath(null);
  }, [
    navigateToPath,
    workspaceTransforms,
    allTransforms,
    addOpenedTransform,
    setActiveTransform,
    setNavigateToPath,
    dispatch,
  ]);

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
      dispatch(replace(Urls.transformList()));
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
    <Stack data-testid="workspace-page" h="100%" gap={0}>
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
        <Flex gap="sm">
          <RunWorkspaceMenu
            workspaceId={id}
            disabled={hasUnsavedChanges() || workspaceTransforms.length === 0}
          />
          <Button
            variant="filled"
            onClick={handleMergeWorkspace}
            loading={isMerging}
            disabled={hasUnsavedChanges() || workspaceTransforms.length === 0}
            size="xs"
          >
            {t`Merge`}
          </Button>
        </Flex>
      </Group>

      <Group
        align="flex-start"
        gap={0}
        flex="1 1 auto"
        wrap="nowrap"
        style={{ overflow: "hidden" }}
      >
        <Box
          data-testid="workspace-content"
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
              if (tab === "metabot") {
                if (activeTransform) {
                  setMetabotContextTransform(activeTransform);
                  setMetabotContextSource(
                    activeEditedTransform?.source ?? activeTransform.source,
                  );
                } else {
                  setMetabotContextTransform(undefined);
                  setMetabotContextSource(undefined);
                }
              }

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
                            <ActionIcon
                              size="1rem"
                              p="0"
                              ml="xs"
                              onClick={(event) =>
                                handleTabClose(event, tab, index)
                              }
                            >
                              <Icon name="close" size={10} aria-hidden />
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
                <SetupTab
                  databaseName={sourceDb?.name}
                  workspaceId={workspace.id}
                />
              </Tabs.Panel>

              {isMetabotAvailable && (
                <Tabs.Panel
                  value="metabot"
                  h="100%"
                  mah="100%"
                  pos="relative"
                  style={{ overflow: "auto" }}
                >
                  <MetabotTab
                    transform={metabotContextTransform}
                    source={metabotContextSource}
                  />
                </Tabs.Panel>
              )}

              <Tabs.Panel value={`table-${activeTable?.tableId}`} h="100%">
                {!activeTable ? null : (
                  <DataTab
                    databaseId={workspace?.database_id ?? null}
                    tableId={activeTable.tableId}
                    transform={workspaceTransforms.find(
                      (transform) =>
                        transform.target.schema === activeTable.schema,
                    )}
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

        <Box
          data-testid="workspace-sidebar"
          style={{ flex: "1 0 auto", width: "30%" }}
        >
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
                    if (activeTable) {
                      setActiveTable(null);
                    }
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
      <WorkspacePageContent key={workspaceId} params={params} />
    </WorkspaceProvider>
  );
};
