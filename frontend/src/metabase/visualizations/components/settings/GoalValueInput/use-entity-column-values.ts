import { useGoalSourceResults } from "metabase/visualizations/hooks/use-goal-source-results";
import { resolveForeignColumnRef } from "metabase/viz-core";
import type { GoalForeignEntityRef } from "metabase-types/api";

type ResolveColumnValue = (column: string) => number | null;

/** Values of the columns of `entity`, `null` until they load or when they can't. */
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
