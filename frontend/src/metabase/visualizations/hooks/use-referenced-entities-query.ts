import { skipToken, useGetGoalValuesQuery } from "metabase/api";
import type { ReferencedEntity } from "metabase-types/api";

export function useReferencedEntitiesQuery(entities: ReferencedEntity[]) {
  return useGetGoalValuesQuery(
    entities.length > 0 ? { sources: sortEntities(entities) } : skipToken,
  );
}

function sortEntities(entities: ReferencedEntity[]): ReferencedEntity[] {
  return [...entities].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id - b.id,
  );
}
