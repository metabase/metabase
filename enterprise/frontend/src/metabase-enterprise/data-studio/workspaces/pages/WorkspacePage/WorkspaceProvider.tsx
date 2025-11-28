import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

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
  setEditedTransform: (transformId: number, data: EditedTransform) => void;
  removeEditedTransform: (transformId: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  const [openedTransforms, setOpenedTransforms] = useState<Transform[]>([]);
  const [activeTransform, setActiveTransform] = useState<
    Transform | undefined
  >();
  const [editedTransforms, setEditedTransforms] = useState<
    Map<number, EditedTransform>
  >(new Map());

  const addOpenedTransform = (transform: Transform) => {
    setOpenedTransforms((prev) => {
      const exists = prev.some((item) => item.id === transform.id);
      if (exists) {
        return prev;
      }

      return [...prev, transform];
    });
  };

  const removeOpenedTransform = (transformId: number) => {
    setOpenedTransforms((prev) =>
      prev.filter((item) => item.id !== transformId),
    );
  };

  const setEditedTransform = (transformId: number, data: EditedTransform) => {
    setEditedTransforms((prev) => new Map(prev).set(transformId, data));
  };

  const removeEditedTransform = (transformId: number) => {
    setEditedTransforms((prev) => {
      const next = new Map(prev);
      next.delete(transformId);
      return next;
    });
  };

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
      setEditedTransform,
      removeEditedTransform,
    }),
    [
      openedTransforms,
      activeTransform,
      activeEditedTransform,
      editedTransforms,
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
