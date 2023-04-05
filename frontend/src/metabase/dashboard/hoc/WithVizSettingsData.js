/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { getUserAttributes } from "metabase/selectors/user";
import { getLinkTargets } from "metabase/lib/click-behavior";
import { loadMetadataForLinkedTargets } from "metabase/dashboard/actions/metadata";

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
        fetch() {
          const { rawSeries, dispatch } = this.props;
          const [firstSeries] = rawSeries || [{}];
          const { visualization_settings } = firstSeries.card || {};
          dispatch(loadMetadataForLinkedTargets(visualization_settings));
        }

        componentDidMount() {
          this.fetch();
        }

        componentDidUpdate(prevProps) {
          if (
            !_.isEqual(
              this.dashcardSettings(this.props),
              this.dashcardSettings(prevProps),
            )
          ) {
            this.fetch();
          }
        }
        render() {
          return <ComposedComponent {..._.omit(this.props, "dispatch")} />;
        }
      },
    ),
  );
};

export default WithVizSettingsData;
