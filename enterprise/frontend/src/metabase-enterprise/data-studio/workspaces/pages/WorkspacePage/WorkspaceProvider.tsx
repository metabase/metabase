import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import type { DraftTransformSource, Transform } from "metabase-types/api";

export interface WorkspaceContextValue {
  openedTransforms: Transform[];
  activeTransform: Transform | undefined;
  setActiveTransform: (transform: Transform | undefined) => void;
  addOpenedTransform: (transform: Transform) => void;
  removeOpenedTransform: (transformId: number) => void;
  editedTransforms: Map<number, DraftTransformSource>;
  setEditedTransform: (
    transformId: number,
    source: DraftTransformSource,
  ) => void;
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
    Map<number, DraftTransformSource>
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

  const setEditedTransform = (
    transformId: number,
    source: DraftTransformSource,
  ) => {
    setEditedTransforms((prev) => new Map(prev).set(transformId, source));
  };

  const removeEditedTransform = (transformId: number) => {
    setEditedTransforms((prev) => {
      const next = new Map(prev);
      next.delete(transformId);
      return next;
    });
  };

  const value = useMemo(
    () => ({
      openedTransforms,
      activeTransform,
      setActiveTransform,
      addOpenedTransform,
      removeOpenedTransform,
      editedTransforms,
      setEditedTransform,
      removeEditedTransform,
    }),
    [openedTransforms, activeTransform, editedTransforms],
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
