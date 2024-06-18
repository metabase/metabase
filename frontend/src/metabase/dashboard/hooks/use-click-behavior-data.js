import { useMemo } from "react";
import _ from "underscore";

import {
  getDashboardComplete,
  getDashCardById,
  getParameterValuesBySlugMap,
} from "metabase/dashboard/selectors";
import { getLinkTargets } from "metabase/lib/click-behavior";
import { useStore } from "metabase/lib/redux";
import { getUserAttributes } from "metabase/selectors/user";

function createGetExtraDataForClick(store, dashcardId) {
  return clicked => {
    const state = store.getState();
    const dashboard = getDashboardComplete(state);
    const dashcard = getDashCardById(state, dashcardId);
    const parameterValuesBySlug = getParameterValuesBySlugMap(state);
    const userAttributes = getUserAttributes(state);

    const entitiesByTypeAndId = _.chain(getLinkTargets(clicked.settings))
      .groupBy(target => target.entity.name)
      .mapObject(targets =>
        _.chain(targets)
          .map(({ entity, entityType, entityId }) =>
            entityType === "question"
              ? entity.selectors.getObject(state, { entityId })?.card()
              : entity.selectors.getObject(state, { entityId }),
          )
          .filter(object => object != null)
          .indexBy(object => object.id)
          .value(),
      )
      .value();
    return {
      ...entitiesByTypeAndId,
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
export const useClickBehaviorData = ({ dashcardId }) => {
  const store = useStore();

  const getExtraDataForClick = useMemo(
    () => createGetExtraDataForClick(store, dashcardId),
    [store, dashcardId],
  );

  return { getExtraDataForClick };
};
