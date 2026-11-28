import { useGoalSourceResults } from "metabase/visualizations/hooks/use-goal-source-results";
import { resolveForeignColumnRef } from "metabase/viz-core";
import type { GoalForeignEntityRef } from "metabase-types/api";

// Returns null when value is loading, or when it can't load
type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const state = useGoalSourceResults(
    enabled && entity != null ? [{ type: entity.type, id: entity.id }] : [],
  );

  return (column) => {
    if (entity == null || state.status === "loading") {
      return null;
    }

    return resolveForeignColumnRef(state.sourceResults, {
      type: entity.type,
      id: entity.id,
      column,
    }).value;
  };
}
