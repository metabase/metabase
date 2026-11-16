import { type GetGoalValuesRequest, skipToken } from "metabase/api";
import { useGetGoalValuesQuery } from "metabase/api/dynamic-goal";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import {
  type GoalValuesScope,
  useGoalValuesScope,
} from "metabase/visualizations/components/GoalValuesScope";
import type { ReferencedEntity } from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

/**
 * Fetches the values of the goal sources `entities` reference. A public or
 * embedded chart gets the values of the goals saved in its settings, a chart
 * seen by a signed-in user gets the values of `entities`. Fetches nothing
 * when `entities` is empty.
 */
export function useGoalValuesQuery(entities: ReferencedEntity[]) {
  const { uuid, token } = useEmbeddingEntityContext();
  const scope = useGoalValuesScope();

  return useGetGoalValuesQuery(
    entities.length > 0
      ? getGoalValuesRequest({ entities, scope, token, uuid })
      : skipToken,
  );
}

function getGoalValuesRequest({
  entities,
  scope,
  token,
  uuid,
}: {
  entities: ReferencedEntity[];
  scope: GoalValuesScope;
  token: EntityToken | null;
  uuid: EntityUuid | null;
}): GetGoalValuesRequest {
  if (token != null) {
    return scope.type === "dashcard"
      ? { type: "embed-dashcard", token, dashcardId: scope.dashcardId }
      : { type: "embed-card", token };
  }

  if (uuid != null) {
    switch (scope.type) {
      case "dashcard":
        return { type: "public-dashcard", uuid, dashcardId: scope.dashcardId };
      case "document-card":
        return { type: "public-document-card", uuid, cardId: scope.cardId };
      case "card":
        return { type: "public-card", uuid };
    }
  }

  return {
    type: "sources",
    sources: sortEntities(entities),
    dashboardId:
      scope.type === "dashcard" && typeof scope.dashboardId === "number"
        ? scope.dashboardId
        : undefined,
  };
}

function sortEntities(entities: ReferencedEntity[]): ReferencedEntity[] {
  return [...entities].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id - b.id,
  );
}
