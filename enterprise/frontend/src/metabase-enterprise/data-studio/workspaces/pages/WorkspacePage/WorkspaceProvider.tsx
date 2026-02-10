import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { isSameSource } from "metabase/transforms/utils";
import type {
  DatasetQuery,
  DraftTransformSource,
  TableId,
  TaggedTransform,
  TransformTargetType,
  UnsavedTransform,
  WorkspaceId,
  WorkspaceTransform,
} from "metabase-types/api";
import { isUnsavedTransform, isWorkspaceTransform } from "metabase-types/api";

import { useActiveTransform } from "./useActiveTransform";

export interface OpenTable {
  tableId: TableId | null;
  name: string;
  schema?: string | null;
  transformId?: string;
  query?: DatasetQuery;
  pythonPreviewResult?: any;
}

export interface EditedTransform {
  name: string;
  source: DraftTransformSource;
  target: {
    name: string;
    schema: string | null;
    type: TransformTargetType;
  };
}

/** Union type for all transform variants used in workspace */
export type AnyWorkspaceTransform =
  | TaggedTransform
  | WorkspaceTransform
  | UnsavedTransform;

export type AnyWorkspaceTransformRef =
  | Pick<TaggedTransform, "id" | "type" | "name">
  | Pick<WorkspaceTransform, "ref_id" | "type" | "name">
  | Pick<UnsavedTransform, "id" | "type" | "name">;

export interface Tab {
  id: string;
  name: string;
  type: "transform" | "table";
}

export interface TransformTab extends Tab {
  type: "transform";
  transformRef: AnyWorkspaceTransformRef;
}

export interface TableTab extends Tab {
  type: "table";
  table: OpenTable;
}

export type WorkspaceTab = TransformTab | TableTab;

export interface WorkspaceContextValue {
  workspaceId: WorkspaceId;
  openedTabs: WorkspaceTab[];
  activeTab: WorkspaceTab | null;
  activeTable: OpenTable | null;
  activeTransformRef: AnyWorkspaceTransformRef | null;
  activeEditedTransform?: EditedTransform | null;
  setActiveTab: (tab: WorkspaceTab | null) => void;
  setActiveTransformRef: (transformRef: AnyWorkspaceTransformRef) => void;
  setActiveTable: (table: OpenTable | null) => void;
  addOpenedTab: (tab: WorkspaceTab, activate?: boolean) => void;
  removeOpenedTab: (tabId: string) => void;
  setOpenedTabs: (tabs: WorkspaceTab[]) => void;
  addOpenedTransform: (transformRef: AnyWorkspaceTransformRef) => void;
  removeWorkspaceTransform: (transformId: string | number) => void;
  editedTransforms: Map<number | string, EditedTransform>;
  patchEditedTransform: (
    transformId: number | string,
    patch: Partial<EditedTransform>,
  ) => void;
  removeEditedTransform: (transformId: string | number) => void;
  updateTransformState: (transform: WorkspaceTransform) => void;
  updateTab: <T extends WorkspaceTab>(tabId: string, patch: Partial<T>) => void;
  hasUnsavedChanges: boolean;
  hasTransformEdits: (originalTransform: AnyWorkspaceTransform) => boolean;
  unsavedTransforms: UnsavedTransform[];
  addUnsavedTransform: (source: DraftTransformSource) => void;
  removeUnsavedTransform: (transformId: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

interface WorkspaceState {
  openedTabs: WorkspaceTab[];
  activeTab: WorkspaceTab | null;
  activeTable: OpenTable | null;
  activeTransformRef: AnyWorkspaceTransformRef | null;
  activeEditedTransform?: AnyWorkspaceTransform | null;
  editedTransforms: Map<number | string, EditedTransform>;
  unsavedTransforms: UnsavedTransform[];
  nextUnsavedTransformIndex: number;
}

interface WorkspaceProviderProps {
  children: ReactNode;
  workspaceId: number;
}

/** Get the unique identifier used for tabs and transform lookups */
export function getTransformId(
  transformRef: AnyWorkspaceTransformRef,
): string | number {
  if (transformRef.type === "workspace-transform") {
    return transformRef.ref_id;
  }
  return transformRef.id;
}

/** Get the tab ID for a transform */
export function getTransformTabId(
  transformRef: AnyWorkspaceTransformRef,
): string {
  return `transform-${getTransformId(transformRef)}`;
}

/** Get the numeric transform ID (for metabot, RunButton, etc.) */
export function getNumericTransformId(
  transform: AnyWorkspaceTransform,
): number | undefined {
  if (isWorkspaceTransform(transform)) {
    return transform.global_id ?? undefined;
  }
  return transform.id;
}

const createEmptyWorkspaceState = (): WorkspaceState => ({
  openedTabs: [],
  activeTransformRef: null,
  activeTable: null,
  activeTab: null,
  editedTransforms: new Map<number | string, EditedTransform>(),
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
  const currentState = useMemo(() => {
    const existing = workspaceStates.get(workspaceId);
    if (existing) {
      return existing;
    }
    const newState = createEmptyWorkspaceState();
    setWorkspaceStates((prev) => new Map(prev).set(workspaceId, newState));
    return newState;
  }, [workspaceId, workspaceStates]);

  const {
    openedTabs,
    activeTransformRef,
    activeTable,
    activeTab,
    unsavedTransforms,
  } = currentState;

  const { data: activeTransform } = useActiveTransform({
    transformRef: activeTransformRef,
    unsavedTransforms,
    workspaceId,
  });

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
    (tab: WorkspaceTab | null) => {
      updateWorkspaceState((state) => {
        const newActiveTab = tab;
        let newActiveTransformRef = state.activeTransformRef;
        let newActiveTable = state.activeTable;

        if (tab?.type === "transform") {
          newActiveTransformRef = tab.transformRef;
          newActiveTable = null;
        } else if (tab?.type === "table") {
          newActiveTable = tab.table;
          newActiveTransformRef = null;
        } else {
          newActiveTransformRef = null;
          newActiveTable = null;
        }

        return {
          ...state,
          activeTab: newActiveTab,
          activeTransformRef: newActiveTransformRef,
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
            activeTransformRef:
              tab.type === "transform"
                ? tab.transformRef
                : state.activeTransformRef,
            activeTable: tab.type === "table" ? tab.table : state.activeTable,
          };
        }

        const newOpenedTabs = [...state.openedTabs, tab];
        return {
          ...state,
          openedTabs: newOpenedTabs,
          activeTab: tab,
          activeTransformRef:
            tab.type === "transform"
              ? tab.transformRef
              : state.activeTransformRef,
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
        let newActiveTransformRef = state.activeTransformRef;
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
            newActiveTransformRef =
              fallbackTab.type === "transform"
                ? fallbackTab.transformRef
                : null;
            newActiveTable =
              fallbackTab.type === "table" ? fallbackTab.table : null;
          } else {
            newActiveTab = null;
            newActiveTransformRef = null;
            newActiveTable = null;
          }
        }

        return {
          ...state,
          openedTabs: filteredTabs,
          activeTab: newActiveTab,
          activeTransformRef: newActiveTransformRef,
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

  const setActiveTransformRef = useCallback(
    (transformRef: AnyWorkspaceTransformRef) => {
      updateWorkspaceState((state) => {
        const transformTabId = getTransformTabId(transformRef);
        const existingTab = state.openedTabs.find(
          (tab) => tab.type === "transform" && tab.id === transformTabId,
        );

        if (existingTab) {
          return {
            ...state,
            activeTab: existingTab,
            activeTransformRef: transformRef,
            activeTable: null,
          };
        } else {
          const newTransformTab: TransformTab = {
            id: transformTabId,
            name: transformRef.name,
            type: "transform",
            transformRef: transformRef,
          };

          return {
            ...state,
            openedTabs: [...state.openedTabs, newTransformTab],
            activeTab: newTransformTab,
            activeTransformRef: transformRef,
            activeTable: null,
          };
        }
      });
    },
    [updateWorkspaceState],
  );

  const addOpenedTransform = useCallback(
    (transformRef: AnyWorkspaceTransformRef) => {
      const transformTab: TransformTab = {
        id: getTransformTabId(transformRef),
        name: transformRef.name,
        type: "transform",
        transformRef: transformRef,
      };
      addOpenedTab(transformTab);
    },
    [addOpenedTab],
  );

  const removeWorkspaceTransform = useCallback(
    (transformId: string | number) => {
      removeOpenedTab(`transform-${transformId}`);
      for (const tab of openedTabs) {
        if (tab.type === "table" && tab.table.transformId === transformId) {
          removeOpenedTab(tab.id);
        }
      }
    },
    [removeOpenedTab, openedTabs],
  );

  const patchEditedTransform = useCallback(
    (transformId: number | string, patch: Partial<EditedTransform>) => {
      updateWorkspaceState((state) => {
        if (!activeTransform) {
          return state;
        }

        const currentTransform =
          state.editedTransforms.get(transformId) ?? activeTransform;
        const newEditedTransform: EditedTransform = {
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

        const newOpenedTabs = state.openedTabs.map((tab) => {
          if (
            tab.type === "transform" &&
            getTransformId(tab.transformRef) === transformId
          ) {
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
        };
      });
    },
    [activeTransform, updateWorkspaceState],
  );

  const removeEditedTransform = useCallback(
    (transformId: string | number) => {
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
        const transformId = transform.ref_id;
        const newOpenedTabs = state.openedTabs.map((tab) => {
          if (
            tab.type === "transform" &&
            getTransformId(tab.transformRef) === transformId
          ) {
            return {
              ...tab,
              transformRef: transform,
              name: transform.name,
            };
          }
          return tab;
        });

        const newEditedTransforms = new Map(state.editedTransforms);
        const currentEdit = state.editedTransforms.get(transformId);

        if (currentEdit) {
          const hasNameChanged = currentEdit.name !== transform.name;
          const hasSourceChanged = !isSameSource(
            currentEdit.source,
            transform.source,
          );

          if (hasNameChanged || hasSourceChanged) {
            newEditedTransforms.set(transformId, {
              ...currentEdit,
              target: transform.target,
            });
          } else {
            newEditedTransforms.delete(transformId);
          }
        }

        const activeTransformId = state.activeTransformRef
          ? getTransformId(state.activeTransformRef)
          : undefined;

        return {
          ...state,
          openedTabs: newOpenedTabs,
          activeTransformRef:
            activeTransformId === transformId
              ? transform
              : state.activeTransformRef,
          editedTransforms: newEditedTransforms,
        };
      });
    },
    [updateWorkspaceState],
  );

  const updateTab = useCallback(
    <T extends WorkspaceTab>(tabId: string, patch: Partial<T>) => {
      updateWorkspaceState((state) => {
        const newOpenedTabs = state.openedTabs.map((tab): WorkspaceTab => {
          if (tab.id === tabId) {
            return { ...tab, ...patch };
          }
          return tab;
        });

        // Also update activeTab if it's the tab being updated
        const newActiveTab: WorkspaceTab | null =
          state.activeTab?.id === tabId
            ? { ...state.activeTab, ...patch }
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

  const hasUnsavedChanges =
    currentState.editedTransforms.size > 0 ||
    currentState.unsavedTransforms.length > 0;

  const hasTransformEdits = useCallback(
    (originalTransform: AnyWorkspaceTransform) => {
      // Unsaved transforms always have changes
      if (isUnsavedTransform(originalTransform)) {
        return true;
      }

      const transformId = getTransformId(originalTransform);
      const edited = currentState.editedTransforms.get(transformId);

      // We don't store workspace transforms sources in the provider, so we can't compare
      // changes. So we just mark all "dirty" workspace transforms as edited.
      if (isWorkspaceTransform(originalTransform) && edited) {
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
    (source: DraftTransformSource) => {
      updateWorkspaceState((state) => {
        const currentIndex = state.nextUnsavedTransformIndex;
        const name =
          currentIndex === 0
            ? t`New transform`
            : t`New transform (${currentIndex})`;

        const newTransform: UnsavedTransform = {
          type: "unsaved-transform",
          id: -1 - currentIndex, // Use negative IDs to avoid collision with existing transforms
          name,
          source,
          target: {
            name: "",
            schema: null,
            type: "table",
          },
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
          id: getTransformTabId(newTransform),
          name: newTransform.name,
          type: "transform",
          transformRef: newTransform,
        };

        return {
          ...state,
          unsavedTransforms: [...state.unsavedTransforms, newTransform],
          nextUnsavedTransformIndex: currentIndex + 1,
          editedTransforms: newEditedTransforms,
          openedTabs: [...state.openedTabs, newTransformTab],
          activeTab: newTransformTab,
          activeTransformRef: newTransform,
          activeTable: null,
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
        const tabId = `transform-${transformId}`;
        const newOpenedTabs = state.openedTabs.filter(
          (tab) => tab.id !== tabId,
        );

        // Clear active state if this was the active transform
        const activeTransformId = state.activeTransformRef
          ? getTransformId(state.activeTransformRef)
          : undefined;
        const newActiveTransformRef =
          activeTransformId === transformId ? null : state.activeTransformRef;
        const newActiveTab =
          state.activeTab?.id === tabId ? null : state.activeTab;

        return {
          ...state,
          unsavedTransforms: newUnsavedTransforms,
          editedTransforms: newEditedTransforms,
          openedTabs: newOpenedTabs,
          activeTransformRef: newActiveTransformRef,
          activeTab: newActiveTab,
        };
      });
    },
    [updateWorkspaceState],
  );

  const setActiveTable = useCallback(
    (table: OpenTable | null) => {
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
              activeTransformRef: null,
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
              activeTransformRef: null,
            };
          }
        } else {
          return {
            ...state,
            activeTab:
              state.activeTab?.type === "table" ? null : state.activeTab,
            activeTable: null,
          };
        }
      });
    },
    [updateWorkspaceState],
  );

  const activeEditedTransform = activeTransform
    ? (currentState.editedTransforms.get(getTransformId(activeTransform)) ??
      activeTransform)
    : activeTransform;

  const value = useMemo(
    () => ({
      workspaceId,
      openedTabs,
      activeTransformRef,
      activeTable,
      activeTab,
      activeEditedTransform,
      setActiveTab,
      setActiveTransformRef,
      setActiveTable,
      addOpenedTab,
      removeOpenedTab,
      removeWorkspaceTransform,
      setOpenedTabs,
      addOpenedTransform,
      editedTransforms: currentState.editedTransforms,
      patchEditedTransform,
      removeEditedTransform,
      updateTransformState,
      updateTab,
      hasUnsavedChanges,
      hasTransformEdits,
      unsavedTransforms: currentState.unsavedTransforms,
      addUnsavedTransform,
      removeUnsavedTransform,
    }),
    [
      workspaceId,
      openedTabs,
      activeTransformRef,
      activeTable,
      activeTab,
      activeEditedTransform,
      setActiveTab,
      setActiveTransformRef,
      setActiveTable,
      addOpenedTab,
      removeOpenedTab,
      setOpenedTabs,
      addOpenedTransform,
      removeWorkspaceTransform,
      currentState.editedTransforms,
      currentState.unsavedTransforms,
      patchEditedTransform,
      removeEditedTransform,
      updateTransformState,
      updateTab,
      hasUnsavedChanges,
      hasTransformEdits,
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
