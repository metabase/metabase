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
import { ResizableBox } from "react-resizable";
import { push, replace } from "react-router-redux";
import { useLatest, useLocation } from "react-use";
import { t } from "ttag";

import { useLazyGetAdhocQueryQuery, useListDatabasesQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import { ResizeHandle } from "metabase/querying/editor/components/QueryEditor/ResizeHandle";
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
  DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
  useGetExternalTransformsQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceTablesQuery,
  useGetWorkspaceTransformsQuery,
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTransformQuery,
  useListTransformsQuery,
  useMergeWorkspaceMutation,
  useRunWorkspaceTransformMutation,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import { PaneHeaderInput } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { MergeWorkspaceModal } from "metabase-enterprise/data-studio/workspaces/components/MergeWorkspaceModal/MergeWorkspaceModal";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks/use-metabot-agent";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";
import type {
  MetabotState,
  MetabotStoreState,
} from "metabase-enterprise/metabot/state";
import { metabotActions } from "metabase-enterprise/metabot/state/reducer";
import { getMetabotState } from "metabase-enterprise/metabot/state/selectors";
import { NAME_MAX_LENGTH } from "metabase-enterprise/transforms/constants";
import type { DraftTransformSource, Transform } from "metabase-types/api";

import { isWorkspaceUninitialized } from "../../utils";

import { AddTransformMenu } from "./AddTransformMenu";
import { CodeTab } from "./CodeTab/CodeTab";
import { DataTab, DataTabSidebar } from "./DataTab";
import { MetabotTab } from "./MetabotTab";
import { PreviewTab as PreviewTabComponent } from "./PreviewTab";
import { SetupTab } from "./SetupTab";
import { TransformTab } from "./TransformTab/TransformTab";
import styles from "./WorkspacePage.module.css";
import {
  type EditedTransform,
  type OpenTable,
  type PreviewTab,
  WorkspaceProvider,
  type WorkspaceTab,
  useWorkspace,
} from "./WorkspaceProvider";

const DEFAULT_SIDEBAR_WIDTH = 400;

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
  transformId?: string;
};

type MetabotConversationSnapshot = Pick<
  MetabotStoreState,
  | "messages"
  | "history"
  | "state"
  | "reactions"
  | "activeToolCalls"
  | "errorMessages"
  | "conversationId"
>;

function WorkspacePageContent({ params, transformId }: WorkspacePageProps) {
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

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
    unsavedTransforms,
  } = useWorkspace();

  // Compute active preview from activeTab
  const activePreview = useMemo(() => {
    if (activeTab?.type === "preview") {
      return activeTab;
    }
    return undefined;
  }, [activeTab]);

  // RTK
  const id = Number(params.workspaceId);
  const { data: databases = { data: [] } } = useListDatabasesQuery({});
  const { data: allDbTransforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);
  const {
    data: workspaceTransforms = [],
    isLoading: isLoadingWorkspaceTransforms,
  } = useGetWorkspaceTransformsQuery(id);
  const { data: externalTransforms, isLoading: isLoadingExternalTransforms } =
    useGetExternalTransformsQuery(
      { workspaceId: id, databaseId: workspace?.database_id ?? null },
      { skip: !id || !workspace?.database_id },
    );

  const availableTransforms = useMemo(
    () => externalTransforms ?? [],
    [externalTransforms],
  );
  const [fetchTransform] = useLazyGetTransformQuery();
  const [fetchWorkspaceTransform] = useLazyGetWorkspaceTransformQuery();
  const isLoading =
    isLoadingWorkspace ||
    isLoadingExternalTransforms ||
    isLoadingWorkspaceTransforms;

  useEffect(() => {
    // Initialize transform tab if redirected from transform page.
    if (transformId) {
      (async () => {
        if (isLoading) {
          return;
        }

        const transform = [...workspaceTransforms, ...availableTransforms].find(
          (transform) => {
            if ("global_id" in transform) {
              return transform.global_id === Number(transformId);
            }
            return transform.id === Number(transformId);
          },
        );

        const isWsTransform = !!transform && "global_id" in transform;

        if (transform && !isWsTransform) {
          const { data } = await fetchTransform(transform.id, true);
          if (data) {
            addOpenedTransform(data);
            setActiveTransform(data);
            setTab(transformId);
          }
        } else if (transform && isWsTransform) {
          const { data } = await fetchWorkspaceTransform({
            workspaceId: id,
            transformId: transform.ref_id,
          });
          if (data) {
            addOpenedTransform(data);
            setActiveTransform(data);
            setTab(transformId);
          }
        } else {
          sendErrorToast(t`Transform ${transformId} not found`);
        }
        dispatch(replace(Urls.dataStudioWorkspace(id)));
      })();
    }
  }, [
    transformId,
    setActiveTransform,
    availableTransforms,
    addOpenedTransform,
    fetchTransform,
    dispatch,
    id,
    isLoading,
    sendErrorToast,
    workspaceTransforms,
    fetchWorkspaceTransform,
  ]);

  const {
    data: workspaceTables = DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
    refetch: refetchWorkspaceTables,
  } = useGetWorkspaceTablesQuery(id);
  const openedTabsRef = useLatest(openedTabs);
  useEffect(() => {
    // Filter all previously opened table tabs, if they no longer exist in the workspace.
    const updatedTabs = openedTabsRef.current.filter((tab) => {
      if (tab.type === "table") {
        return (
          workspaceTables.inputs.some(
            (table) => table.table_id === tab.table.tableId,
          ) ||
          workspaceTables.outputs.some(
            (table) => table.isolated.table_id === tab.table.tableId,
          )
        );
      }
      return true;
    });
    setOpenedTabs(updatedTabs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceTables, setOpenedTabs]);

  const [mergeWorkspace, { isLoading: isMerging }] =
    useMergeWorkspaceMutation();
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const [runTransform] = useRunWorkspaceTransformMutation();
  const [runAdhocQuery] = useLazyGetAdhocQueryQuery();
  const [runningTransforms, setRunningTransforms] = useState<Set<string>>(
    new Set(),
  );

  // Metabot
  const metabotState = useSelector(getMetabotState);
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const { navigateToPath, setNavigateToPath } = useMetabotReactions();
  const {
    resetConversation: resetMetabotConversation,
    visible: isMetabotVisible,
  } = useMetabotAgent();
  const metabotStateRef = useRef<MetabotState>(metabotState);
  useEffect(() => {
    metabotStateRef.current = metabotState;
  }, [metabotState]);
  const metabotSnapshots = useRef<Map<number, MetabotConversationSnapshot>>(
    new Map(),
  );
  useRegisterMetabotContextProvider(async () => {
    if (!workspace?.database_id) {
      return;
    }
    return { default_database_id: workspace.database_id };
  }, [workspace?.database_id]);
  const [metabotContextTransform, setMetabotContextTransform] = useState<
    Transform | undefined
  >();
  const [metabotContextSource, setMetabotContextSource] = useState<
    DraftTransformSource | undefined
  >();
  useEffect(() => {
    if (isMetabotAvailable && isMetabotVisible) {
      setTab("metabot");
      setActiveTab(undefined);
    }
  }, [isMetabotAvailable, isMetabotVisible, setActiveTab]);

  const sourceDb = databases?.data.find(
    (db) => db.id === workspace?.database_id,
  );

  const dbTransforms = useMemo(
    () =>
      allDbTransforms.filter((t) => {
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
    [allDbTransforms, sourceDb],
  );
  const allTransforms = useMemo(
    () => [...unsavedTransforms, ...workspaceTransforms],
    [unsavedTransforms, workspaceTransforms],
  );

  const tabsListRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<string>("setup");
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  useEffect(() => {
    // Sync UI tabs with active tab changes from workspace.
    if (activeTab) {
      setTab(activeTab.id);
    }
  }, [id, activeTab, setTab]);

  const isArchived = workspace?.status === "archived";

  useEffect(() => {
    // Scroll to active tab on change.
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
      const targetTransform = allTransforms.find(
        (t: Transform | WorkspaceTransformItem) =>
          ("id" in t && t.id === transformIdFromPath) ||
          ("ref_id" in t && t.ref_id === String(transformIdFromPath)),
      );

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

  const handleMergeWorkspace = useCallback(
    async (commitMessage: string) => {
      try {
        const response = await mergeWorkspace({
          id,
          commit_message: commitMessage,
        }).unwrap();

        if (response.errors && response.errors.length > 0) {
          sendErrorToast(
            t`Failed to merge workspace: ${response.errors.map((e: any) => e.error).join(", ")}`,
          );
          return;
        }
        dispatch(replace(Urls.transformList()));
        sendSuccessToast(
          t`Workspace '${response.workspace.name}' merged successfully`,
        );
      } catch (error) {
        sendErrorToast(t`Failed to merge workspace`);
        throw error;
      }
    },
    [id, mergeWorkspace, sendErrorToast, dispatch, sendSuccessToast],
  );

  const handleWorkspaceNameChange = useCallback(
    async (newName: string) => {
      if (!workspace || newName.trim() === workspace.name.trim()) {
        return;
      }

      try {
        await updateWorkspace({ id, name: newName.trim() }).unwrap();
      } catch (error) {
        sendErrorToast(t`Failed to update workspace name`);
      }
    },
    [workspace, id, updateWorkspace, sendErrorToast],
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
      setTab(tableTab.id);
    },
    [addOpenedTab],
  );

  const handleRunTransformAndShowPreview = useCallback(
    async (transform: WorkspaceTransformItem) => {
      setRunningTransforms((prev) => new Set(prev).add(transform.ref_id));

      try {
        const result = await runTransform({
          workspaceId: id,
          transformId: transform.ref_id,
        }).unwrap();

        if (result.status === "failed") {
          sendErrorToast(t`Transform run failed`);
          return;
        }

          const { data: updatedTables } = await refetchWorkspaceTables();
          const updatedOutput = updatedTables?.outputs.find(
            (t) => t.isolated.transform_id === transform.ref_id,
          );

          if (updatedOutput?.isolated.table_id) {
            handleTableSelect({
              tableId: updatedOutput.isolated.table_id,
              name: updatedOutput.global.table,
              schema: updatedOutput.global.schema,
              transformId: transform.ref_id,
            });
          }
      } catch (error) {
        sendErrorToast(t`Failed to run transform`);
        console.error("Failed to run transform", error);
      } finally {
        setRunningTransforms((prev) => {
          const next = new Set(prev);
          next.delete(transform.ref_id);
          return next;
        });
      }
    },
    [id, runTransform, refetchWorkspaceTables, handleTableSelect, sendErrorToast],
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
    return <NotFound />;
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
            disabled={isArchived}
          />
        </Flex>
        <Flex gap="sm">
          <Button
            variant="filled"
            onClick={() => setIsMergeModalOpen(true)}
            loading={isMerging}
            disabled={
              isArchived ||
              hasUnsavedChanges() ||
              workspaceTransforms.length === 0
            }
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
          h="100%"
          style={{
            flex: "1 1 auto",
            minWidth: 0,
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
                  <Tabs.List
                    ref={tabsListRef}
                    className={styles.tabsPanel}
                    data-testid="workspace-tabs"
                  >
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
                                  : tab.type === "preview"
                                    ? "eye"
                                    : "table"
                              }
                              aria-hidden
                            />
                            {tab.name}
                            <ActionIcon
                              component="span"
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
                <SetupTab databaseId={sourceDb?.id} workspace={workspace} />
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
                    workspaceId={workspace?.id}
                    databaseId={workspace?.database_id ?? null}
                    tableId={activeTable.tableId}
                    transformId={activeTable.transformId}
                  />
                )}
              </Tabs.Panel>

              <Tabs.Panel
                value={`transform-${activeTransform?.id}`}
                h="100%"
                style={{ overflow: "auto" }}
              >
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
                    isDisabled={isArchived}
                    onChange={handleTransformChange}
                    onOpenTransform={(transform) => {
                      // After adding first transform to a workspace,
                      // show 'Setup' tab with initialization status log.
                      if (isWorkspaceUninitialized(workspace)) {
                        setActiveTransform(transform);
                        return setTab("setup");
                      }
                      setActiveTransform(transform);
                      setTab(String(transform.id));
                    }}
                  />
                )}
              </Tabs.Panel>

              {activePreview && (
                <Tabs.Panel value={activePreview.id} h="100%">
                  <PreviewTabComponent
                    dataset={activePreview.dataset}
                    isLoading={activePreview.isLoading}
                  />
                </Tabs.Panel>
              )}
            </Box>
          </Tabs>
        </Box>

        <ResizableBox
          axis="x"
          width={sidebarWidth}
          height={Infinity}
          resizeHandles={["w"]}
          handle={<ResizeHandle />}
          minConstraints={[250, Infinity]}
          maxConstraints={[600, Infinity]}
          onResize={(_e, { size }) => setSidebarWidth(size.width)}
          className={styles.sidebarResizableBox}
        >
          <Box data-testid="workspace-sidebar" h="100%" w="100%">
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
                    disabled={isArchived}
                  />
                )}
              </Flex>
              <Tabs.Panel value="code" p="md">
                <CodeTab
                  readOnly={isArchived}
                  activeTransformId={activeTransform?.id}
                  availableTransforms={availableTransforms}
                  workspaceId={workspace.id}
                  workspaceTransforms={allTransforms}
                  onTransformClick={(transform) => {
                    addOpenedTransform(transform);
                    setTab(String(transform.id));
                    if (activeTable) {
                      setActiveTable(undefined);
                    }
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="data" p="md">
                <DataTabSidebar
                  tables={workspaceTables}
                  workspaceTransforms={workspaceTransforms}
                  dbTransforms={dbTransforms}
                  selectedTableId={activeTable?.tableId}
                  runningTransforms={runningTransforms}
                  onTransformClick={async (
                    workspaceTransform: WorkspaceTransformItem,
                  ) => {
                    const { data: transform } = await fetchWorkspaceTransform(
                      {
                        workspaceId: workspace.id,
                        transformId: workspaceTransform.ref_id,
                      },
                      true,
                    );
                    if (transform) {
                      addOpenedTransform(transform);
                    }
                  }}
                  onTableSelect={handleTableSelect}
                  onRunTransform={handleRunTransformAndShowPreview}
                />
              </Tabs.Panel>
            </Tabs>
          </Box>
        </ResizableBox>
      </Group>

      {isMergeModalOpen && (
        <MergeWorkspaceModal
          onClose={() => setIsMergeModalOpen(false)}
          onSubmit={handleMergeWorkspace}
          isLoading={isMerging}
          workspaceId={id}
          workspaceName={workspace?.name ?? ""}
          workspaceTransforms={workspaceTransforms}
        />
      )}
    </Stack>
  );
}

export const WorkspacePage = ({ params }: WorkspacePageProps) => {
  const workspaceId = Number(params.workspaceId);
  const { search } = useLocation();

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspacePageContent
        key={workspaceId}
        params={params}
        transformId={new URLSearchParams(search).get("transformId")}
      />
    </WorkspaceProvider>
  );
};
