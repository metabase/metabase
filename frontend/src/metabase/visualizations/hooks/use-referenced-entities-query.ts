import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import type { DatasetQuery, ReferencedEntity } from "metabase-types/api";

export function useReferencedEntitiesQuery(
  datasetQuery: DatasetQuery | undefined,
  entities: ReferencedEntity[],
) {
  return useGetAdhocQueryQuery(
    entities.length > 0 && datasetQuery != null
      ? {
          ...datasetQuery,
          referenced_entities: sortEntities(entities),
          ignore_error: true,
        }
      : skipToken,
  );
}

function sortEntities(entities: ReferencedEntity[]): ReferencedEntity[] {
  return [...entities].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id - b.id,
  );
}
