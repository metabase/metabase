/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { getUserAttributes } from "metabase/selectors/user";

import Questions from "metabase/entities/questions";
import Dashboards from "metabase/entities/dashboards";

function hasLinkedQuestionOrDashboard({ type, linkType, action } = {}) {
  if (type === "link") {
    return linkType === "question" || linkType === "dashboard";
  }
  return false;
}

function mapLinkedEntityToEntityQuery({ type, linkType, action, targetId }) {
  return {
    entity: linkType === "question" ? Questions : Dashboards,
    entityId: targetId,
  };
}

// This HOC give access to data referenced in viz settings.
// We use it to fetch and select entities needed for dashboard drill actions (e.g. clicking through to a question)
const WithVizSettingsData = ComposedComponent => {
  function getLinkTargets(settings) {
    const { click_behavior, column_settings = {} } = settings || {};
    return [
      click_behavior,
      ...Object.values(column_settings).map(
        settings => settings.click_behavior,
      ),
    ]
      .filter(hasLinkedQuestionOrDashboard)
      .map(mapLinkedEntityToEntityQuery);
  }
  return connect(
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
          parameterValuesBySlug: props.parameterValuesBySlug,
          dashboard: props.dashboard,
          userAttributes: getUserAttributes(state, props),
        };
      },
    }),
    dispatch => ({ dispatch }),
  )(
    class WithVizSettingsData extends React.Component {
      dashcardSettings(props) {
        const [firstSeries] = props.rawSeries || [{}];
        const { visualization_settings } = firstSeries.card || {};
        return visualization_settings;
      }

      fetch() {
        getLinkTargets(this.dashcardSettings(this.props)).forEach(
          ({ entity, entityId }) =>
            this.props.dispatch(
              entity.actions.fetch({ id: entityId }, { noEvent: true }),
            ),
        );
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
  );
};

export default WithVizSettingsData;
