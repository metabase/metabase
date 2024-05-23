import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
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
  location,
  routerParams,
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
      location,
      routerParams,
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
    (_state, props) => props.location,
    (_state, props) => props.params,
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
  return withRouter(
    connect(
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
    ),
  );
};
