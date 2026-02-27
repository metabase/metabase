import { useMemo } from "react";
import _ from "underscore";

import {
  getDashCardById,
  getDashboardComplete,
  getParameterValuesBySlugMap,
  getParameters,
} from "metabase/dashboard/selectors";
import { getLinkTargets } from "metabase/lib/click-behavior";
import { useStore } from "metabase/lib/redux";
import { getUserAttributes } from "metabase/selectors/user";
import type { ClickObject } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type { DashCardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

type EntityObject = {
  id: number | string;
};

type LinkedEntityTarget = {
  entity: {
    name: string;
    selectors: {
      getObject: (
        state: State,
        opts: { entityId: number | string | undefined },
      ) => unknown;
    };
  };
  entityType: "question" | "dashboard";
  entityId: number | string | undefined;
};

function isEntityObject(value: unknown): value is EntityObject {
  return _.isObject(value) && "id" in value;
}

function resolveLinkedObject(target: LinkedEntityTarget, state: State) {
  const object = target.entity.selectors.getObject(state, {
    entityId: target.entityId,
  });

  if (target.entityType === "question") {
    if (object instanceof Question) {
      const card = object.card();
      return isEntityObject(card) ? card : null;
    }
    return null;
  }

  return isEntityObject(object) ? object : null;
}

function getEntitiesByTypeAndId(
  state: State,
  clicked: ClickObject | null,
): Record<string, Record<string | number, EntityObject>> {
  const targets: LinkedEntityTarget[] = getLinkTargets(clicked?.settings);

  return targets.reduce<Record<string, Record<string | number, EntityObject>>>(
    (acc, target) => {
      const linkedObject = resolveLinkedObject(target, state);
      if (!linkedObject) {
        return acc;
      }

      const entityName = target.entity.name;
      const bucket = acc[entityName] ?? {};
      bucket[linkedObject.id] = linkedObject;
      acc[entityName] = bucket;
      return acc;
    },
    {},
  );
}

function createGetExtraDataForClick(
  store: ReturnType<typeof useStore>,
  dashcardId: DashCardId,
) {
  return (clicked: ClickObject | null) => {
    const state = store.getState();
    const dashboard = getDashboardComplete(state);
    const dashcard = getDashCardById(state, dashcardId);
    const parameters = getParameters(state);
    const parameterValuesBySlug = getParameterValuesBySlugMap(state);
    const userAttributes = getUserAttributes(state);
    const entitiesByTypeAndId = getEntitiesByTypeAndId(state, clicked);

    return {
      ...entitiesByTypeAndId,
      parameters,
      parameterValuesBySlug,
      dashboard,
      dashcard,
      userAttributes,
    };
  };
}

/**
 * This hook gives access to data referenced in viz settings.
 */
export const useClickBehaviorData = ({
  dashcardId,
}: {
  dashcardId: DashCardId;
}) => {
  const store = useStore();

  const getExtraDataForClick = useMemo(
    () => createGetExtraDataForClick(store, dashcardId),
    [store, dashcardId],
  );

  return { getExtraDataForClick };
};
