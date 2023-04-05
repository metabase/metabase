/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { getUserAttributes } from "metabase/selectors/user";
import { getLinkTargets } from "metabase/lib/click-behavior";

// This HOC give access to data referenced in viz settings.
// We use it to fetch and select entities needed for dashboard drill actions (e.g. clicking through to a question)
const WithVizSettingsData = ComposedComponent => {
  return withRouter(
    connect(
      (state, props) => ({
        getExtraDataForClick: clicked => {
          const entitiesByTypeAndId = _.chain(getLinkTargets(clicked.settings))
            .groupBy(target => target.entity.name)
            .mapObject(targets =>
              _.chain(targets)
                .map(({ entity, entityId }) =>
                  entity.selectors.getObject(state, { entityId }),
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
      class WithVizSettingsData extends React.Component {
        dashcardSettings({ rawSeries }) {
          const [firstSeries] = rawSeries || [{}];
          const { visualization_settings } = firstSeries.card || {};
          return visualization_settings;
        }

        render() {
          return <ComposedComponent {..._.omit(this.props, "dispatch")} />;
        }
      },
    ),
  );
};

export default WithVizSettingsData;
