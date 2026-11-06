import type { DynamicGoalSource } from "metabase/visualizations/analytics";
import type { GoalValue } from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import { useReferencedEntity } from "./use-referenced-entity";

/**
 * The kind of source a dynamic goal value comes from, for analytics.
 * Returns null when `value` is not a dynamic goal: a static number, or null
 * when no goal is set. Returns `"card"` for a reference to a card that hasn't
 * loaded, either because it is still loading or because it can't be loaded.
 */
export function useDynamicGoalSource(
  value: GoalValue | null,
): DynamicGoalSource | null {
  const foreignRef = isGoalForeignColumnRef(value) ? value : null;
  const { kind } = useReferencedEntity(foreignRef);

  if (foreignRef != null) {
    return kind ?? foreignRef.type;
  }

  return isGoalSelfColumnRef(value) ? "self_column" : null;
}
