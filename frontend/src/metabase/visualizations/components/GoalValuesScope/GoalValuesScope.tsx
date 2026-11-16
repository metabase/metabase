import { type PropsWithChildren, createContext, useContext } from "react";

import type { CardId, DashCardId, DashboardId } from "metabase-types/api";

/**
 * Where a chart is shown, which tells public and embedded charts which
 * endpoint returns the values of their dynamic goals.
 */
export type GoalValuesScope =
  | { type: "card" }
  | { type: "dashcard"; dashboardId: DashboardId; dashcardId: DashCardId }
  | { type: "document-card"; cardId: CardId };

const CARD_SCOPE: GoalValuesScope = { type: "card" };

const GoalValuesScopeContext = createContext<GoalValuesScope>(CARD_SCOPE);

export function GoalValuesScopeProvider({
  scope,
  children,
}: PropsWithChildren<{ scope: GoalValuesScope }>) {
  return (
    <GoalValuesScopeContext.Provider value={scope}>
      {children}
    </GoalValuesScopeContext.Provider>
  );
}

export function useGoalValuesScope(): GoalValuesScope {
  return useContext(GoalValuesScopeContext);
}
