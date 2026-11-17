import { useMemo } from "react";
import _ from "underscore";

import { getUserAttributes } from "metabase/current-user";
import {
  setOrUnsetParameterValues,
  setParameterValue,
} from "metabase/dashboard/actions/parameters";
import {
  getDashCardById,
  getDashboardComplete,
  getLinkTargetEntities,
  getParameterValuesBySlugMap,
  getParameters,
} from "metabase/dashboard/selectors";
import { useStore } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { ClickObject } from "metabase/visualizations/types";
import type {
  CardId,
  ClickBehavior,
  DashCardId,
  DashboardId,
  EntityCustomDestinationClickBehavior,
  VisualizationSettings,
} from "metabase-types/api";

type EntityObject = {
  id: number | string;
};

type LinkedEntityTarget =
  | { entityType: "question"; entityId: CardId | undefined }
  | { entityType: "dashboard"; entityId: DashboardId | undefined };

function isEntityObject(value: unknown): value is EntityObject {
  return _.isObject(value) && "id" in value;
}

function resolveLinkedObject(target: LinkedEntityTarget, state: State) {
  if (target.entityId == null) {
    return null;
  }

  const targets = getLinkTargetEntities(state);
  const linked =
    target.entityType === "question"
      ? targets.questions[target.entityId]
      : targets.dashboards[target.entityId];

  return isEntityObject(linked) ? linked : null;
}

/**
 * Only the targets a click behavior actually names, so a key is absent when
 * the dashboard carries no link of that kind.
 */
type LinkedEntities = {
  questions?: Record<CardId, EntityObject>;
  dashboards?: Record<DashboardId, EntityObject>;
};

function getEntitiesByTypeAndId(
  state: State,
  clicked: ClickObject | null,
): LinkedEntities {
  const targets = getLinkTargets(clicked?.settings);

  return targets.reduce<LinkedEntities>((acc, target) => {
    const linkedObject = resolveLinkedObject(target, state);
    if (!linkedObject) {
      return acc;
    }

    const entityName =
      target.entityType === "question" ? "questions" : "dashboards";
    acc[entityName] = {
      ...acc[entityName],
      [linkedObject.id]: linkedObject,
    };
    return acc;
  }, {});
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

function mapLinkedEntityToEntityQuery(
  clickBehavior: EntityCustomDestinationClickBehavior,
): LinkedEntityTarget {
  return clickBehavior.linkType === "question"
    ? { entityType: "question", entityId: clickBehavior.targetId }
    : { entityType: "dashboard", entityId: clickBehavior.targetId };
}
