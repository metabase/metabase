import { Component } from "react";
import { connect } from "react-redux";
import { createSelector, weakMapMemoize } from "reselect";
import _ from "underscore";

import { getLinkTargets } from "metabase/lib/click-behavior";
import { getUserAttributes } from "metabase/selectors/user";

function getExtraDataForClick(
  entities,
  userAttributes,
  dashboard,
  dashcard,
  parameterValuesBySlug,
) {
  return clicked => {
    const entitiesByTypeAndId = _.chain(getLinkTargets(clicked.settings))
      .groupBy(target => target.entity.name)
      .mapObject(targets =>
        _.chain(targets)
          .map(({ entity, entityType, entityId }) =>
            entityType === "question"
              ? entity.selectors.getObject({ entities }, { entityId })?.card()
              : entity.selectors.getObject({ entities }, { entityId }),
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

const createGetExtraDataForClick = createSelector(
  [
    state => state.entities,
    state => getUserAttributes(state),
    (_state, props) => props.dashboard,
    (_state, props) => props.dashcard,
    (_state, props) => props.parameterValuesBySlug,
  ],
  getExtraDataForClick,
  {
    memoize: weakMapMemoize,
    argsMemoize: weakMapMemoize,
  },
);

/**
 * This HOC gives access to data referenced in viz settings.
 * @deprecated HOCs are deprecated
 */
export const WithVizSettingsData = ComposedComponent => {
  return connect(
    (state, props) => {
      const getExtraDataForClick = createGetExtraDataForClick(state, props);
      return { getExtraDataForClick };
    },
    dispatch => ({ dispatch }),
  )(
    class WithVizSettingsData extends Component {
      render() {
        return <ComposedComponent {..._.omit(this.props, "dispatch")} />;
      }
    },
  );
};
