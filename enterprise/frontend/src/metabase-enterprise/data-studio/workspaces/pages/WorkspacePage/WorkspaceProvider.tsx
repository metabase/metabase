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
  DraftTransformSource,
  Transform,
  TransformTargetType,
} from "metabase-types/api";

export interface EditedTransform {
  name: string;
  source: DraftTransformSource;
  target: {
    name: string;
    type: TransformTargetType;
  };
}

export interface WorkspaceContextValue {
  openedTransforms: Transform[];
  activeTransform: Transform | undefined;
  activeEditedTransform: EditedTransform | undefined;
  setActiveTransform: (transform: Transform | undefined) => void;
  addOpenedTransform: (transform: Transform) => void;
  removeOpenedTransform: (transformId: number) => void;
  editedTransforms: Map<number, EditedTransform>;
  patchEditedTransform: (
    transformId: number,
    patch: Partial<EditedTransform>,
  ) => void;
  removeEditedTransform: (transformId: number) => void;
  runTransforms: Set<number>;
  updateTransformState: (
    transform: Transform,
    editedTransform?: EditedTransform | null,
  ) => void;
  hasUnsavedChanges: () => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

interface WorkspaceState {
  openedTransforms: Transform[];
  activeTransform: Transform | undefined;
  editedTransforms: Map<number, EditedTransform>;
  runTransforms: Set<number>;
}

interface WorkspaceProviderProps {
  children: ReactNode;
  workspaceId: number;
}

const createEmptyWorkspaceState = (): WorkspaceState => ({
  openedTransforms: [],
  activeTransform: undefined,
  editedTransforms: new Map(),
  runTransforms: new Set(),
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

  const { openedTransforms, activeTransform, editedTransforms, runTransforms } =
    currentState;

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

  const setActiveTransform = useCallback(
    (transform: Transform | undefined) => {
      updateWorkspaceState((state) => ({
        ...state,
        activeTransform: transform,
      }));
    },
    [updateWorkspaceState],
  );

  const addOpenedTransform = useCallback(
    (transform: Transform) => {
      updateWorkspaceState((state) => {
        const exists = state.openedTransforms.some(
          (item) => item.id === transform.id,
        );
        if (exists) {
          return state;
        }
        return {
          ...state,
          openedTransforms: [...state.openedTransforms, transform],
        };
      });
    },
    [updateWorkspaceState],
  );

  const removeOpenedTransform = useCallback(
    (transformId: number) => {
      updateWorkspaceState((state) => {
        const filteredTransforms = state.openedTransforms.filter(
          (item) => item.id !== transformId,
        );

        // If the removed transform was active, update to a neighboring transform
        let newActiveTransform = state.activeTransform;
        if (state.activeTransform?.id === transformId) {
          const currentIndex = state.openedTransforms.findIndex(
            (item) => item.id === transformId,
          );

          // Prefer the transform before (previous), otherwise use the one after (next)
          if (currentIndex > 0) {
            // Use the previous transform
            newActiveTransform = state.openedTransforms[currentIndex - 1];
          } else if (filteredTransforms.length > 0) {
            // Use the next transform (which is now at index 0 after filtering)
            newActiveTransform = filteredTransforms[0];
          } else {
            // No more transforms, set to undefined
            newActiveTransform = undefined;
          }
        }

        return {
          ...state,
          openedTransforms: filteredTransforms,
          activeTransform: newActiveTransform,
        };
      });
    },
    [updateWorkspaceState],
  );

  const patchEditedTransform = useCallback(
    (transformId: number, patch: Partial<EditedTransform>) => {
      updateWorkspaceState((state) => {
        const activeTransform = checkNotNull(state.activeTransform);
        const currentTransform =
          state.editedTransforms.get(transformId) ?? activeTransform;
        const newEditedTransform = {
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
        return {
          ...state,
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
    (transform: Transform, editedTransform?: EditedTransform | null) => {
      updateWorkspaceState((state) => {
        const openedTransforms = state.openedTransforms.map((item) =>
          item.id === transform.id ? transform : item,
        );

        const newEditedTransforms = new Map(state.editedTransforms);
        if (editedTransform == null) {
          newEditedTransforms.delete(transform.id);
        } else {
          newEditedTransforms.set(transform.id, editedTransform);
        }

        const newRunTransforms = new Set(state.runTransforms);
        newRunTransforms.delete(transform.id);

        return {
          ...state,
          openedTransforms,
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

  const hasUnsavedChanges = useCallback(() => {
    return editedTransforms.size > 0;
  }, [editedTransforms]);

  const activeEditedTransform = activeTransform
    ? (editedTransforms.get(activeTransform.id) ?? activeTransform)
    : activeTransform;

  const value = useMemo(
    () => ({
      openedTransforms,
      activeTransform,
      activeEditedTransform,
      setActiveTransform,
      addOpenedTransform,
      removeOpenedTransform,
      editedTransforms,
      patchEditedTransform,
      removeEditedTransform,
      runTransforms,
      updateTransformState,
      hasUnsavedChanges,
    }),
    [
      openedTransforms,
      activeTransform,
      activeEditedTransform,
      editedTransforms,
      runTransforms,
      setActiveTransform,
      addOpenedTransform,
      removeOpenedTransform,
      patchEditedTransform,
      removeEditedTransform,
      updateTransformState,
      hasUnsavedChanges,
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
