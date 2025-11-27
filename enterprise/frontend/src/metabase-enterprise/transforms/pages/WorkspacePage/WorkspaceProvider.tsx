import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export interface WorkspaceTransform {
  id: number;
  name: string;
  source: unknown;
}

export interface WorkspaceContextValue {
  openedTransforms: WorkspaceTransform[];
  activeTransform: WorkspaceTransform | undefined;
  setActiveTransform: (transform: WorkspaceTransform | undefined) => void;
  addOpenedTransform: (transform: WorkspaceTransform) => void;
  removeOpenedTransform: (transformId: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  const [openedTransforms, setOpenedTransforms] = useState<WorkspaceTransform[]>(
    [],
  );
  const [activeTransform, setActiveTransform] = useState<
    WorkspaceTransform | undefined
  >();

  const addOpenedTransform = (transform: WorkspaceTransform) => {
    setOpenedTransforms(prev => {
      const exists = prev.some(item => item.id === transform.id);
      if (exists) {
        return prev;
      }

      return [...prev, transform];
    });
  };

  const removeOpenedTransform = (transformId: number) => {
    setOpenedTransforms(prev => prev.filter(item => item.id !== transformId));
  };

  const value = useMemo(
    () => ({
      openedTransforms,
      activeTransform,
      setActiveTransform,
      addOpenedTransform,
      removeOpenedTransform,
    }),
    [openedTransforms, activeTransform],
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
