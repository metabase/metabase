import { type ReactNode, createContext, useContext } from "react";

import type { GoalSourcesScope } from "metabase-types/api";

const SIGNED_IN_SCOPE: GoalSourcesScope = { type: "signed-in" };

const GoalSourcesScopeContext =
  createContext<GoalSourcesScope>(SIGNED_IN_SCOPE);

type GoalSourcesScopeProviderProps = {
  children: ReactNode;
  scope: GoalSourcesScope;
};

/** Sets where the charts inside fetch their goal source results from. */
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

/** The scope set by the closest provider. Signed-in, with no dashboard, without one. */
export function useGoalSourcesScope(): GoalSourcesScope {
  return useContext(GoalSourcesScopeContext);
}
