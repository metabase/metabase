import { type ReactNode, createContext, useContext } from "react";

import type { WorktreeId } from "metabase-types/api";

const WorktreeContext = createContext<WorktreeId | undefined>(undefined);

type WorktreeProviderProps = {
  worktreeId: WorktreeId;
  children: ReactNode;
};

export function WorktreeProvider({
  worktreeId,
  children,
}: WorktreeProviderProps) {
  return (
    <WorktreeContext.Provider value={worktreeId}>
      {children}
    </WorktreeContext.Provider>
  );
}

/**
 * The remote-sync worktree the current page is scoped to, or undefined in the
 * main app. Everything rendered inside a worktree — lists, creation flows,
 * collection pickers — should read this and scope its requests accordingly.
 */
export function useWorktreeId(): WorktreeId | undefined {
  return useContext(WorktreeContext);
}
