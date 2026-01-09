import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { checkNotNull } from "metabase/lib/types";
import { isSameSource } from "metabase-enterprise/transforms/utils";
import type {
  DatasetQuery,
  DraftTransformSource,
  TableId,
  Transform,
  TransformTargetType,
  WorkspaceTransform,
  WorkspaceTransformItem,
} from "metabase-types/api";

export interface OpenTable {
  tableId: TableId | null;
  name: string;
  schema?: string | null;
  transformId?: string;
  query?: DatasetQuery;
}

export interface EditedTransform {
  name: string;
  source: DraftTransformSource;
  target: {
    name: string;
    type: TransformTargetType;
  };
}

export interface Tab {
  id: string;
  name: string;
  type: "transform" | "table" | "preview";
}

export interface TransformTab extends Tab {
  type: "transform";
  transform: Transform | WorkspaceTransform;
}

export interface TableTab extends Tab {
  type: "table";
  table: OpenTable;
}

export type WorkspaceTab = TransformTab | TableTab;

export interface WorkspaceContextValue {
  workspaceId: number;
  openedTabs: WorkspaceTab[];
  activeTransform?: Transform;
  activeEditedTransform?: EditedTransform;
  activeTable?: OpenTable;
  activeTab?: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab | undefined) => void;
  setActiveTransform: (
    transform: Transform | WorkspaceTransform | undefined,
  ) => void;
  setActiveTable: (table: OpenTable | undefined) => void;
  addOpenedTab: (tab: WorkspaceTab, activate?: boolean) => void;
  removeOpenedTab: (tabId: string) => void;
  setOpenedTabs: (tabs: WorkspaceTab[]) => void;
  addOpenedTransform: (transform: Transform | WorkspaceTransformItem) => void;
  removeOpenedTransform: (transformId: number) => void;
  editedTransforms: Map<number | string, EditedTransform>;
  patchEditedTransform: (
    transformId: number,
    patch: Partial<EditedTransform>,
  ) => void;
  removeEditedTransform: (transformId: number) => void;
  runTransforms: Set<number>;
  updateTransformState: (transform: WorkspaceTransform) => void;
  updateTab: <T extends WorkspaceTab>(tabId: string, patch: Partial<T>) => void;
  hasUnsavedChanges: () => boolean;
  hasTransformEdits: (
    originalTransform: Transform | WorkspaceTransform,
  ) => boolean;
  isWorkspaceExecuting: boolean;
  setIsWorkspaceExecuting: (value: boolean) => void;
  unsavedTransforms: Transform[];
  addUnsavedTransform: (transform: Transform) => void;
  removeUnsavedTransform: (transformId: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

interface WorkspaceState {
  openedTabs: WorkspaceTab[];
  activeTransform?: Transform | WorkspaceTransform;
  activeEditedTransform?: Transform;
  activeTable?: OpenTable;
  activeTab?: WorkspaceTab;
  editedTransforms: Map<number | string, EditedTransform>;
  runTransforms: Set<number>;
  unsavedTransforms: Transform[];
  nextUnsavedTransformIndex: number;
}

interface WorkspaceProviderProps {
  children: ReactNode;
  workspaceId: number;
}

const createEmptyWorkspaceState = (): WorkspaceState => ({
  openedTabs: [],
  activeTransform: undefined,
  activeTable: undefined,
  activeTab: undefined,
  editedTransforms: new Map<number | string, EditedTransform>(),
  runTransforms: new Set<number>(),
  unsavedTransforms: [],
  nextUnsavedTransformIndex: 0,
});

export const WorkspaceProvider = ({
  children,
  workspaceId,
}: WorkspaceProviderProps) => {
  const [workspaceStates, setWorkspaceStates] = useState<
    Map<number, WorkspaceState>
  >(new Map());
  const [isWorkspaceExecuting, setIsWorkspaceExecuting] = useState(false);

  const currentState = useMemo(() => {
    const existing = workspaceStates.get(workspaceId);
    if (existing) {
      return existing;
    }
    const newState = createEmptyWorkspaceState();
    setWorkspaceStates((prev) => new Map(prev).set(workspaceId, newState));
    return newState;
  }, [workspaceId, workspaceStates]);

  const { openedTabs, activeTransform, activeTable, activeTab } = currentState;

  const updateWorkspaceState = useCallback(
    (updater: (state: WorkspaceState) => WorkspaceState) => {
      setWorkspaceStates((prev) => {
        const currentState =
          prev.get(workspaceId) ?? createEmptyWorkspaceState();
        const newState = updater(currentState);
        return new Map(prev).set(workspaceId, newState);
      });
    },
    [workspaceId],
  );

  const setActiveTab = useCallback(
    (tab: WorkspaceTab | undefined) => {
      updateWorkspaceState((state) => {
        const newActiveTab = tab;
        let newActiveTransform = state.activeTransform;
        let newActiveTable = state.activeTable;

        if (tab?.type === "transform") {
          newActiveTransform = tab.transform;
          newActiveTable = undefined;
        } else if (tab?.type === "table") {
          newActiveTable = tab.table;
          newActiveTransform = undefined;
        } else {
          newActiveTransform = undefined;
          newActiveTable = undefined;
        }

        return {
          ...state,
          activeTab: newActiveTab,
          activeTransform: newActiveTransform,
          activeTable: newActiveTable,
        };
      });
    },
    [updateWorkspaceState],
  );

  const addOpenedTab = useCallback(
    (tab: WorkspaceTab) => {
      updateWorkspaceState((state) => {
        const exists = state.openedTabs.some((item) => item.id === tab.id);
        if (exists) {
          return {
            ...state,
            openedTabs: state.openedTabs.map((item) =>
              item.id === tab.id ? tab : item,
            ),
            activeTab: tab,
            activeTransform:
              tab.type === "transform" ? tab.transform : state.activeTransform,
            activeTable: tab.type === "table" ? tab.table : state.activeTable,
          };
        }

        const newOpenedTabs = [...state.openedTabs, tab];
        return {
          ...state,
          openedTabs: newOpenedTabs,
          activeTab: tab,
          activeTransform:
            tab.type === "transform" ? tab.transform : state.activeTransform,
          activeTable: tab.type === "table" ? tab.table : state.activeTable,
        };
      });
    },
    [updateWorkspaceState],
  );

  const removeOpenedTab = useCallback(
    (tabId: string) => {
      updateWorkspaceState((state) => {
        const filteredTabs = state.openedTabs.filter(
          (item) => item.id !== tabId,
        );

        const removedTab = state.openedTabs.find((item) => item.id === tabId);
        const wasActive = state.activeTab?.id === tabId;

        let newActiveTab = state.activeTab;
        let newActiveTransform = state.activeTransform;
        let newActiveTable = state.activeTable;

        if (wasActive && removedTab) {
          const currentIndex = state.openedTabs.findIndex(
            (item) => item.id === tabId,
          );

          const preferPrevious = currentIndex > 0;
          const fallbackTab = preferPrevious
            ? state.openedTabs[currentIndex - 1]
            : filteredTabs[0];

          if (fallbackTab) {
            newActiveTab = fallbackTab;
            newActiveTransform =
              fallbackTab.type === "transform"
                ? fallbackTab.transform
                : undefined;
            newActiveTable =
              fallbackTab.type === "table" ? fallbackTab.table : undefined;
          } else {
            newActiveTab = undefined;
            newActiveTransform = undefined;
            newActiveTable = undefined;
          }
        }

        return {
          ...state,
          openedTabs: filteredTabs,
          activeTab: newActiveTab,
          activeTransform: newActiveTransform,
          activeTable: newActiveTable,
        };
      });
    },
    [updateWorkspaceState],
  );

  const setOpenedTabs = useCallback(
    (tabs: WorkspaceTab[]) => {
      updateWorkspaceState((state) => ({
        ...state,
        openedTabs: tabs,
      }));
    },
    [updateWorkspaceState],
  );

  const setActiveTransform = useCallback(
    (transform?: Transform | WorkspaceTransform) => {
      updateWorkspaceState((state) => {
        if (transform) {
          const existingTab = state.openedTabs.find(
            (tab) =>
              // TODO: Add ref_id handling
              tab.type === "transform" && tab.transform.id === transform.id,
          );

          if (existingTab) {
            return {
              ...state,
              activeTab: existingTab,
              activeTransform: transform,
              activeTable: undefined,
            };
          } else {
            const newTransformTab: TransformTab = {
              id: `transform-${transform.id}`,
              name: transform.name,
              type: "transform",
              transform,
            };

            return {
              ...state,
              openedTabs: [...state.openedTabs, newTransformTab],
              activeTab: newTransformTab,
              activeTransform: transform,
              activeTable: undefined,
            };
          }
        } else {
          return {
            ...state,
            activeTab:
              state.activeTab?.type === "transform"
                ? undefined
                : state.activeTab,
            activeTransform: undefined,
          };
        }
      });
    },
    [updateWorkspaceState],
  );

  const addOpenedTransform = useCallback(
    (transform: Transform | WorkspaceTransform) => {
      const transformTab: TransformTab = {
        id: `transform-${transform.id}`,
        name: transform.name,
        type: "transform",
        transform,
      };
      addOpenedTab(transformTab);
    },
    [addOpenedTab],
  );

  const removeOpenedTransform = useCallback(
    (transformId: number) => {
      removeOpenedTab(`transform-${transformId}`);
    },
    [removeOpenedTab],
  );

  const patchEditedTransform = useCallback(
    (transformId: number, patch: Partial<EditedTransform>) => {
      updateWorkspaceState((state) => {
        const activeTransform = checkNotNull(state.activeTransform);
        const currentTransform =
          state.editedTransforms.get(transformId) ?? activeTransform;
        const newEditedTransform = {
          ...activeTransform,
          name: patch.name ? patch.name : currentTransform.name,
          source: patch.source ? patch.source : currentTransform.source,
          target: patch.target ? patch.target : currentTransform.target,
        };

        const hasChanges =
          !isSameSource(newEditedTransform.source, activeTransform.source) ||
          newEditedTransform.name !== activeTransform.name ||
          newEditedTransform.target.name !== activeTransform.target.name;

        const newEditedTransforms = new Map(state.editedTransforms);

        if (hasChanges) {
          newEditedTransforms.set(transformId, newEditedTransform);
        } else {
          newEditedTransforms.delete(transformId);
        }
        const newRunTransforms = new Set(state.runTransforms);
        newRunTransforms.delete(transformId);

        const newOpenedTabs = state.openedTabs.map((tab) => {
          if (tab.type === "transform" && tab.transform.id === transformId) {
            return {
              ...tab,
              name: newEditedTransform.name,
            };
          }
          return tab;
        });

        return {
          ...state,
          openedTabs: newOpenedTabs,
          editedTransforms: newEditedTransforms,
          runTransforms: newRunTransforms,
        };
      });
    },
    [updateWorkspaceState],
  );

  const removeEditedTransform = useCallback(
    (transformId: number) => {
      updateWorkspaceState((state) => {
        const newEditedTransforms = new Map(state.editedTransforms);
        newEditedTransforms.delete(transformId);
        return {
          ...state,
          editedTransforms: newEditedTransforms,
        };
      });
    },
    [updateWorkspaceState],
  );

  const updateTransformState = useCallback(
    (transform: WorkspaceTransform) => {
      updateWorkspaceState((state) => {
        const newOpenedTabs = state.openedTabs.map((tab) => {
          if (tab.type === "transform" && tab.transform.id === transform.id) {
            return {
              ...tab,
              transform,
              name: transform.name,
            };
          }
          return tab;
        });

        const newEditedTransforms = new Map(state.editedTransforms);
        const currentEdit = state.editedTransforms.get(transform.id);

        if (currentEdit) {
          const hasNameChanged = currentEdit.name !== transform.name;
          const hasSourceChanged = !isSameSource(
            currentEdit.source,
            transform.source,
          );

          if (hasNameChanged || hasSourceChanged) {
            newEditedTransforms.set(transform.id, {
              ...currentEdit,
              target: transform.target,
            });
          } else {
            newEditedTransforms.delete(transform.id);
          }
        }

        const newRunTransforms = new Set(state.runTransforms);
        newRunTransforms.delete(transform.id);

        return {
          ...state,
          openedTabs: newOpenedTabs,
          activeTransform:
            state.activeTransform?.id === transform.id
              ? transform
              : state.activeTransform,
          editedTransforms: newEditedTransforms,
          runTransforms: newRunTransforms,
        };
      });
    },
    [updateWorkspaceState],
  );

  const updateTab = useCallback(
    <T extends WorkspaceTab>(tabId: string, patch: Partial<T>) => {
      updateWorkspaceState((state) => {
        const newOpenedTabs = state.openedTabs.map((tab) => {
          if (tab.id === tabId) {
            return {
              ...tab,
              ...patch,
            } as WorkspaceTab;
          }
          return tab;
        });

        // Also update activeTab if it's the tab being updated
        const newActiveTab =
          state.activeTab?.id === tabId
            ? ({ ...state.activeTab, ...patch } as WorkspaceTab)
            : state.activeTab;

        return {
          ...state,
          openedTabs: newOpenedTabs,
          activeTab: newActiveTab,
        };
      });
    },
    [updateWorkspaceState],
  );

  const hasUnsavedChanges = useCallback(() => {
    return (
      currentState.editedTransforms.size > 0 ||
      currentState.unsavedTransforms.length > 0
    );
  }, [currentState.editedTransforms, currentState.unsavedTransforms]);

  const hasTransformEdits = useCallback(
    (originalTransform: Transform | WorkspaceTransform) => {
      // Check if it's an unsaved transform (negative IDs, always has changes)
      if (
        typeof originalTransform.id === "number" &&
        originalTransform.id < 0
      ) {
        return true;
      }

      const edited =
        "ref_id" in originalTransform
          ? currentState.editedTransforms.get(originalTransform.ref_id)
          : currentState.editedTransforms.get(originalTransform.id);

      // We don't store workspace transforms sources in the provider, so we can't compare
      // changes. So we just mark all "dirty" workspace transforms as edited.
      if ("ref_id" in originalTransform && edited) {
        return true;
      }

      return (
        edited != null &&
        (!isSameSource(edited.source, originalTransform.source) ||
          edited.name !== originalTransform.name ||
          edited.target.name !== originalTransform.target.name)
      );
    },
    [currentState.editedTransforms],
  );

  const addUnsavedTransform = useCallback(
    (transform: Transform) => {
      updateWorkspaceState((state) => {
        const currentIndex = state.nextUnsavedTransformIndex;
        const name =
          currentIndex === 0
            ? "New transform"
            : `New transform (${currentIndex})`;

        const newTransform: Transform = {
          ...transform,
          name,
          id: -1 - currentIndex, // Use negative IDs to distinguish unsaved transforms
        };

        // Add edited transform to mark it as having changes
        const newEditedTransforms = new Map(state.editedTransforms);
        newEditedTransforms.set(newTransform.id, {
          name: newTransform.name,
          source: newTransform.source,
          target: newTransform.target,
        });

        // Create and add the new transform tab
        const newTransformTab: TransformTab = {
          id: `transform-${newTransform.id}`,
          name: newTransform.name,
          type: "transform",
          transform: newTransform,
        };

        return {
          ...state,
          unsavedTransforms: [...state.unsavedTransforms, newTransform],
          nextUnsavedTransformIndex: currentIndex + 1,
          editedTransforms: newEditedTransforms,
          openedTabs: [...state.openedTabs, newTransformTab],
          activeTab: newTransformTab,
          activeTransform: newTransform,
          activeTable: undefined,
        };
      });
    },
    [updateWorkspaceState],
  );

  const removeUnsavedTransform = useCallback(
    (transformId: number) => {
      updateWorkspaceState((state) => {
        const newUnsavedTransforms = state.unsavedTransforms.filter(
          (transform) => transform.id !== transformId,
        );

        const newEditedTransforms = new Map(state.editedTransforms);
        newEditedTransforms.delete(transformId);

        // Remove from opened tabs if present
        const newOpenedTabs = state.openedTabs.filter(
          (tab) =>
            !(tab.type === "transform" && tab.transform.id === transformId),
        );

        // Clear active state if this was the active transform
        const newActiveTransform =
          state.activeTransform?.id === transformId
            ? undefined
            : state.activeTransform;
        const newActiveTab =
          state.activeTab?.id === `transform-${transformId}`
            ? undefined
            : state.activeTab;

        return {
          ...state,
          unsavedTransforms: newUnsavedTransforms,
          editedTransforms: newEditedTransforms,
          openedTabs: newOpenedTabs,
          activeTransform: newActiveTransform,
          activeTab: newActiveTab,
        };
      });
    },
    [updateWorkspaceState],
  );

  const setActiveTable = useCallback(
    (table: OpenTable | undefined) => {
      updateWorkspaceState((state) => {
        if (table) {
          const existingTab = state.openedTabs.find(
            (tab) =>
              tab.type === "table" && tab.table.tableId === table.tableId,
          );

          if (existingTab) {
            return {
              ...state,
              activeTab: existingTab,
              activeTable: table,
              activeTransform: undefined,
            };
          } else {
            const newTableTab: TableTab = {
              id: `table-${table.tableId}`,
              name: table.schema ? `${table.schema}.${table.name}` : table.name,
              type: "table",
              table,
            };

            return {
              ...state,
              openedTabs: [...state.openedTabs, newTableTab],
              activeTab: newTableTab,
              activeTable: table,
              activeTransform: undefined,
            };
          }
        } else {
          return {
            ...state,
            activeTab:
              state.activeTab?.type === "table" ? undefined : state.activeTab,
            activeTable: undefined,
          };
        }
      });
    },
    [updateWorkspaceState],
  );

  const activeEditedTransform = activeTransform
    ? (currentState.editedTransforms.get(activeTransform.id) ?? activeTransform)
    : activeTransform;

  const value = useMemo(
    () => ({
      workspaceId,
      openedTabs,
      activeTransform,
      activeTable,
      activeTab,
      activeEditedTransform,
      setActiveTab,
      setActiveTransform,
      setActiveTable,
      addOpenedTab,
      removeOpenedTab,
      setOpenedTabs,
      addOpenedTransform,
      removeOpenedTransform,
      editedTransforms: currentState.editedTransforms,
      patchEditedTransform,
      removeEditedTransform,
      runTransforms: currentState.runTransforms,
      updateTransformState,
      updateTab,
      hasUnsavedChanges,
      hasTransformEdits,
      isWorkspaceExecuting,
      setIsWorkspaceExecuting,
      unsavedTransforms: currentState.unsavedTransforms,
      addUnsavedTransform,
      removeUnsavedTransform,
    }),
    [
      workspaceId,
      openedTabs,
      activeTransform,
      activeTable,
      activeTab,
      activeEditedTransform,
      setActiveTab,
      setActiveTransform,
      setActiveTable,
      addOpenedTab,
      removeOpenedTab,
      setOpenedTabs,
      addOpenedTransform,
      removeOpenedTransform,
      currentState.editedTransforms,
      currentState.runTransforms,
      currentState.unsavedTransforms,
      patchEditedTransform,
      removeEditedTransform,
      updateTransformState,
      updateTab,
      hasUnsavedChanges,
      hasTransformEdits,
      isWorkspaceExecuting,
      addUnsavedTransform,
      removeUnsavedTransform,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return context;
};

export const useOptionalWorkspace = (): WorkspaceContextValue | undefined => {
  return useContext(WorkspaceContext);
};
