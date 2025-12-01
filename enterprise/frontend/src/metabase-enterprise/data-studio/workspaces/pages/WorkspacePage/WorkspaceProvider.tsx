import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { checkNotNull } from "metabase/lib/types";
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
  markTransformAsRun: (transformId: number) => void;
  hasChangedAndRunTransforms: () => boolean;
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
      updateWorkspaceState((state) => ({
        ...state,
        openedTransforms: state.openedTransforms.filter(
          (item) => item.id !== transformId,
        ),
      }));
    },
    [updateWorkspaceState],
  );

  const patchEditedTransform = useCallback(
    (transformId: number, patch: Partial<EditedTransform>) => {
      updateWorkspaceState((state) => {
        const activeTransform = checkNotNull(state.activeTransform);
        const newEditedTransform = {
          name: patch.name ? patch.name : activeTransform.name,
          source: patch.source ? patch.source : activeTransform.source,
          target: patch.target ? patch.target : activeTransform.target,
        };

        const newEditedTransforms = new Map(state.editedTransforms).set(
          transformId,
          newEditedTransform,
        );
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

  const markTransformAsRun = useCallback(
    (transformId: number) => {
      updateWorkspaceState((state) => ({
        ...state,
        runTransforms: new Set(state.runTransforms).add(transformId),
      }));
    },
    [updateWorkspaceState],
  );

  const hasChangedAndRunTransforms = useCallback(() => {
    return runTransforms.size > 0;
  }, [runTransforms]);

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
      markTransformAsRun,
      hasChangedAndRunTransforms,
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
      markTransformAsRun,
      hasChangedAndRunTransforms,
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
