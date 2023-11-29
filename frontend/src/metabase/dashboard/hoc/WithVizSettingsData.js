import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { getUserAttributes } from "metabase/selectors/user";
import { getLinkTargets } from "metabase/lib/click-behavior";

/**
 * This HOC gives access to data referenced in viz settings.
 * @deprecated HOCs are deprecated
 */
export const WithVizSettingsData = ComposedComponent => {
  return withRouter(
    connect(
      (state, props) => ({
        getExtraDataForClick: clicked => {
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
            location: props.location,
            routerParams: props.params,
            parameterValuesBySlug: props.parameterValuesBySlug,
            dashboard: props.dashboard,
            dashcard: props.dashcard,
            userAttributes: getUserAttributes(state, props),
          };
        },
      }),
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
