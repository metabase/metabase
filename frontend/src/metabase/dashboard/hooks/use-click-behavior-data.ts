import { useMemo } from "react";
import _ from "underscore";

import {
  setOrUnsetParameterValues,
  setParameterValue,
} from "metabase/dashboard/actions/parameters";
import {
  getDashCardById,
  getDashboardComplete,
  getParameterValuesBySlugMap,
  getParameters,
} from "metabase/dashboard/selectors";
import { useStore } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserAttributes } from "metabase/selectors/user";
import type { ClickObject } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type {
  ClickBehavior,
  DashCardId,
  EntityCustomDestinationClickBehavior,
  VisualizationSettings,
} from "metabase-types/api";

type EntityObject = {
  id: number | string;
};

type LinkedEntityTarget = {
  entityType: "question" | "dashboard";
  entityId: number | string | undefined;
};

function isEntityObject(value: unknown): value is EntityObject {
  return _.isObject(value) && "id" in value;
}

function resolveLinkedObject(target: LinkedEntityTarget, state: State) {
  if (target.entityType === "question") {
    const object =
      target.entityId != null
        ? getMetadata(state).question(target.entityId)
        : null;
    if (object instanceof Question) {
      const card = object.card();
      return isEntityObject(card) ? card : null;
    }
    return null;
  }

  const dashboard =
    target.entityId != null ? state.entities.dashboards[target.entityId] : null;
  return isEntityObject(dashboard) ? dashboard : null;
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

      const entityName =
        target.entityType === "question" ? "questions" : "dashboards";
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
      setOrUnsetParameterValues,
      setParameterValue,
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

export function getLinkTargets(settings?: VisualizationSettings) {
  const { click_behavior, column_settings = {} } = settings || {};
  return [
    click_behavior,
    ...Object.values(column_settings).map(
      (settings) => settings.click_behavior,
    ),
  ]
    .filter(hasLinkedQuestionOrDashboard)
    .map(mapLinkedEntityToEntityQuery);
}

function hasLinkedQuestionOrDashboard({
  type,
  linkType,
}: {
  type?: ClickBehavior["type"];
  linkType?: EntityCustomDestinationClickBehavior["linkType"];
} = {}) {
  if (type === "link") {
    return linkType === "question" || linkType === "dashboard";
  }
  return false;
}

function mapLinkedEntityToEntityQuery({
  linkType,
  targetId,
}: {
  linkType: EntityCustomDestinationClickBehavior["linkType"];
  targetId: EntityCustomDestinationClickBehavior["targetId"];
}) {
  return {
    entityType: linkType,
    entityId: targetId,
  };
}
