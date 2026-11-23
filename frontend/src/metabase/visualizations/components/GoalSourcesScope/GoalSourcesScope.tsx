import { type ReactNode, createContext, useContext } from "react";

import type { GoalSourcesScope } from "metabase-types/api";

const SIGNED_IN_SCOPE: GoalSourcesScope = { type: "signed-in" };

const GoalSourcesScopeContext =
  createContext<GoalSourcesScope>(SIGNED_IN_SCOPE);

type GoalSourcesScopeProviderProps = {
  children: ReactNode;
  scope: GoalSourcesScope;
};

export function GoalSourcesScopeProvider({
  children,
  scope,
}: GoalSourcesScopeProviderProps) {
  return (
    <GoalSourcesScopeContext.Provider value={scope}>
      {children}
    </GoalSourcesScopeContext.Provider>
  );
}

export function useGoalSourcesScope(): GoalSourcesScope {
  return useContext(GoalSourcesScopeContext);
}
