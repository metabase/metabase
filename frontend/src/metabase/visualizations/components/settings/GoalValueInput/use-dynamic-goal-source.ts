import type { DynamicGoalSource } from "metabase/visualizations/analytics";
import type { GoalValue } from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import { useReferencedEntity } from "./use-referenced-entity";

/**
 * The kind of source a dynamic goal value comes from, for analytics. Null for
 * a static or empty value. A foreign reference falls back to its entity type
 * until the entity loads.
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
