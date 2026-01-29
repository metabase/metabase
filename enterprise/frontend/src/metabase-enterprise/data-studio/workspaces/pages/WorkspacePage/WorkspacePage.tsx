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
import classNames from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResizableBox } from "react-resizable";
import type { Route } from "react-router";
import { replace } from "react-router-redux";
import { useLocation } from "react-use";
import { t } from "ttag";

import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ResizeHandle } from "metabase/common/components/ResizeHandle";
import { Sortable } from "metabase/common/components/Sortable";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
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
import { PaneHeaderInput } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { MergeWorkspaceModal } from "metabase-enterprise/data-studio/workspaces/components/MergeWorkspaceModal/MergeWorkspaceModal";
import { RunWorkspaceMenu } from "metabase-enterprise/data-studio/workspaces/components/RunWorkspaceMenu/RunWorkspaceMenu";
import { NAME_MAX_LENGTH } from "metabase-enterprise/transforms/constants";

import { isWorkspaceUninitialized } from "../../utils";

import { AddTransformMenu } from "./AddTransformMenu";
import { CodeTab } from "./CodeTab/CodeTab";
import { DataTab, DataTabSidebar } from "./DataTab";
import { GraphTab } from "./GraphTab";
import { SetupTab } from "./SetupTab";
import { TransformTab } from "./TransformTab/TransformTab";
import styles from "./WorkspacePage.module.css";
import {
  WorkspaceProvider,
  type WorkspaceTab,
  getTransformId,
  getTransformTabId,
  useWorkspace,
} from "./WorkspaceProvider";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { useWorkspaceData } from "./useWorkspaceData";

const DEFAULT_SIDEBAR_WIDTH = 400;

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
  route: Route;
  transformId?: string;
};

function WorkspacePageContent({
  params,
  route,
  transformId,
}: WorkspacePageProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });
  const dispatch = useDispatch();

  const {
    openedTabs,
    activeTransform,
    activeEditedTransform,
    activeTable,
    activeTab,
    setActiveTab,
    setActiveTable,
    setActiveTransform,
    removeOpenedTab,
    setOpenedTabs,
    addOpenedTransform,
    hasUnsavedChanges,
    unsavedTransforms,
  } = useWorkspace();

  const [isResizing, setIsResizing] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const { tab, setTab, ref: tabsListRef } = useWorkspaceUiTabs();

  const workspaceId = Number(params.workspaceId);

  // Data fetching
  const {
    workspace,
    workspaceTransforms,
    availableTransforms,
    allTransforms,
    setupStatus,
    error,
    isLoading,
    isLoadingWorkspace,
    isLoadingWorkspaceTransforms,
    isArchived,
    isPending,
  } = useWorkspaceData({ workspaceId, unsavedTransforms });
  const databaseId = workspace?.database_id;

  // Workspace actions
  const {
    isMerging,
    runningTransforms,
    handleMergeWorkspace,
    handleWorkspaceNameChange,
    handleTableSelect,
    handleRunTransformAndShowPreview,
    handleTransformClick,
    handleNavigateToTransform,
  } = useWorkspaceActions({
    workspaceId,
    workspace,
    onOpenTab: setTab,
    workspaceTransforms,
    availableTransforms,
  });

  useEffect(() => {
    // Handle transformId URL param - initialize transform tab if redirected from transform page
    if (!transformId || isLoading) {
      return;
    }

    (async () => {
      const parsedId = parseInt(transformId, 10);
      await handleNavigateToTransform(isNaN(parsedId) ? transformId : parsedId);

      dispatch(replace(Urls.dataStudioWorkspace(workspaceId)));
    })();
  }, [
    transformId,
    isLoading,
    workspaceId,
    handleNavigateToTransform,
    dispatch,
  ]);

  const handleTabClose = useCallback(
    (event: React.MouseEvent, tab: WorkspaceTab, index: number) => {
      event.stopPropagation();

      const isActive =
        (tab.type === "transform" &&
          activeTransform &&
          getTransformId(activeTransform) === getTransformId(tab.transform)) ||
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
        setActiveTab(null);
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

  const handleTabChange = useCallback(
    (newTab: string | null) => {
      if (newTab) {
        setTab(newTab);
      }
    },
    [setTab],
  );

  if (error || isLoadingWorkspace) {
    return (
      <Stack h="100%" justify="center">
        <LoadingAndErrorWrapper error={error} loading={isLoadingWorkspace} />
      </Stack>
    );
  }

  if (!workspace) {
    return <NotFound />;
  }

  return (
    <Stack
      bg="background-primary"
      className={classNames({
        [styles.resizing]: isResizing,
      })}
      data-testid="workspace-page"
      h="100%"
      gap={0}
    >
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
            readOnly={isArchived}
          />
        </Flex>
        <Flex gap="sm">
          <RunWorkspaceMenu
            workspaceId={workspaceId}
            disabled={
              isArchived ||
              hasUnsavedChanges ||
              workspaceTransforms.length === 0
            }
          />
          <Button
            variant="filled"
            onClick={() => setIsMergeModalOpen(true)}
            loading={isMerging}
            disabled={
              isArchived ||
              isPending ||
              hasUnsavedChanges ||
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
            onChange={handleTabChange}
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
                    <Tabs.Tab value="setup" onClick={() => setActiveTab(null)}>
                      <Group gap="xs" wrap="nowrap">
                        <Icon name="database" aria-hidden />
                        {t`Setup`}
                      </Group>
                    </Tabs.Tab>
                    <Tabs.Tab value="graph" onClick={() => setActiveTab(null)}>
                      <Group gap="xs" wrap="nowrap">
                        <Icon name="dependencies" aria-hidden />
                        {t`Graph`}
                      </Group>
                    </Tabs.Tab>

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
                          onMouseDown={(event) => {
                            // close tab on middle-click (mouse wheel)
                            if (event.button === 1) {
                              handleTabClose(event, tab, index);
                            }
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

            <Box flex={1} mih={0}>
              <Tabs.Panel value="setup" h="100%" p="md">
                <SetupTab
                  databaseId={databaseId}
                  workspace={workspace}
                  setupStatus={setupStatus}
                />
              </Tabs.Panel>
              <Tabs.Panel
                bg="background-secondary"
                value="graph"
                h="100%"
                p="md"
              >
                <GraphTab workspaceId={workspace?.id} />
              </Tabs.Panel>

              {activeTable && activeTab?.type === "table" && (
                <Tabs.Panel value={activeTab.id} h="100%">
                  <DataTab
                    workspaceId={workspace?.id}
                    databaseId={workspace?.database_id ?? null}
                    tableId={activeTable.tableId}
                    transformId={activeTable.transformId}
                    query={activeTable.query}
                    pythonPreviewResult={activeTable.pythonPreviewResult}
                  />
                </Tabs.Panel>
              )}

              {activeTransform && (
                <Tabs.Panel
                  value={getTransformTabId(activeTransform)}
                  h="100%"
                  style={{ overflow: "auto" }}
                >
                  {!activeEditedTransform ? (
                    <Text c="text-secondary">
                      {t`Select a transform on the right.`}
                    </Text>
                  ) : (
                    <TransformTab
                      databaseId={checkNotNull(workspace.database_id)}
                      transform={activeTransform}
                      workspaceId={workspaceId}
                      workspaceTransforms={workspaceTransforms}
                      isDisabled={isArchived || isPending}
                      onSaveTransform={(transform) => {
                        // After adding first transform to a workspace,
                        // show 'Setup' tab with initialization status log.
                        if (isWorkspaceUninitialized(workspace)) {
                          setActiveTransform(transform);
                          return setTab("setup");
                        }
                        setActiveTransform(transform);
                        setTab(getTransformTabId(transform));
                      }}
                    />
                  )}
                </Tabs.Panel>
              )}
            </Box>
          </Tabs>
        </Box>

        <ResizableBox
          axis="x"
          width={DEFAULT_SIDEBAR_WIDTH}
          height={Infinity}
          resizeHandles={["w"]}
          handle={<ResizeHandle />}
          minConstraints={[250, Infinity]}
          maxConstraints={[600, Infinity]}
          onResizeStart={() => setIsResizing(true)}
          onResizeStop={() => setIsResizing(false)}
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
                {databaseId && (
                  <AddTransformMenu
                    databaseId={databaseId}
                    disabled={isArchived}
                  />
                )}
              </Flex>
              <Tabs.Panel value="code" p="md">
                <CodeTab
                  readOnly={isArchived || isPending}
                  activeTransformId={
                    activeTransform
                      ? getTransformId(activeTransform)
                      : undefined
                  }
                  databaseId={databaseId}
                  workspaceId={workspace.id}
                  workspaceTransforms={allTransforms}
                  isLoadingWorkspaceTransforms={isLoadingWorkspaceTransforms}
                  onTransformClick={(transform) => {
                    addOpenedTransform(transform);
                    setTab(getTransformTabId(transform));
                    if (activeTable) {
                      setActiveTable(null);
                    }
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="data" p="md">
                <DataTabSidebar
                  readOnly={isArchived || isPending}
                  workspaceTransforms={workspaceTransforms}
                  databaseId={databaseId}
                  selectedTableId={activeTable?.tableId}
                  runningTransforms={runningTransforms}
                  workspaceId={workspace.id}
                  onTransformClick={handleTransformClick}
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
          isDisabled={isPending}
          workspaceId={workspaceId}
          workspaceName={workspace?.name ?? ""}
          workspaceTransforms={workspaceTransforms}
        />
      )}

      <LeaveRouteConfirmModal isEnabled={hasUnsavedChanges} route={route} />
    </Stack>
  );
}

export const WorkspacePage = ({ params, route }: WorkspacePageProps) => {
  const workspaceId = Number(params.workspaceId);
  const { search } = useLocation();
  const transformId = new URLSearchParams(search).get("transformId");

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspacePageContent
        key={workspaceId}
        params={params}
        route={route}
        transformId={transformId ?? undefined}
      />
    </WorkspaceProvider>
  );
};

function useWorkspaceUiTabs() {
  const { activeTab } = useWorkspace();
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<string>("setup");

  useEffect(() => {
    // Sync UI tabs with active tab changes from workspace.
    if (activeTab) {
      setTab(activeTab.id);
    } else {
      setTab((tab) => (["setup", "graph"].includes(tab) ? tab : "setup"));
    }
  }, [activeTab, setTab]);

  useEffect(() => {
    // Scroll to active tab on change.
    if (tabsListRef.current && tab) {
      const activeTabElement =
        tabsListRef.current.querySelector(`[data-active="true"]`);

      if (activeTabElement) {
        activeTabElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [tab]);

  return { tab, setTab, ref: tabsListRef };
}
