import type {
  CardId,
  GoalValue,
  MeasureId,
  ReferencedEntity,
  VisualizationSettings,
} from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

/**
 * Viz settings whose values may reference another entity's column. Mirrors
 * `goal-settings` in `metabase.visualization-settings.dynamic-goals`, which
 * derives the same specs server-side for saved cards.
 */
function getGoalValues(settings: VisualizationSettings): (GoalValue | null)[] {
  return (settings["gauge.segments"] ?? []).flatMap((segment) => [
    segment.min,
    segment.max,
  ]);
}

type ReferencedEntityColumns =
  | { type: "card"; id: CardId; columns: Set<string> }
  | { type: "measure"; id: MeasureId; columns: Set<string> };

/**
 * The entities whose values the server has to run alongside the main query for
 * these settings to render, deduped and grouped by entity.
 */
export const getReferencedEntitiesFromVizSettings = (
  settings: VisualizationSettings,
): ReferencedEntity[] => {
  const refs = getGoalValues(settings).filter(isGoalForeignColumnRef);

  const columnsByEntity = refs.reduce((map, ref) => {
    const key = `${ref.type}:${ref.id}`;
    const entry = map.get(key) ?? {
      type: ref.type,
      id: ref.id,
      columns: new Set<string>(),
    };
    entry.columns.add(ref.column);
    map.set(key, entry);
    return map;
  }, new Map<string, ReferencedEntityColumns>());

  return Array.from(columnsByEntity.values(), ({ type, id, columns }) => ({
    type,
    id,
    columns: Array.from(columns),
  }));
};
