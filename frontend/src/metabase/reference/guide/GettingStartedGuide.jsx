/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { connect } from "react-redux";
import { t, jt } from "c-3po";
import cx from "classnames";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import GuideHeader from "metabase/reference/components/GuideHeader.jsx";
import GuideDetail from "metabase/reference/components/GuideDetail.jsx";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import { clearRequestState } from "metabase/redux/requests";
import Dashboards from "metabase/entities/dashboards";

import { updateSetting } from "metabase/admin/settings/settings";

import {
  getGuide,
  getUser,
  getDashboards,
  getLoading,
  getError,
  getIsEditing,
  getTables,
  getFields,
  getMetrics,
  getSegments,
} from "../selectors";

import { getQuestionUrl, has } from "../utils";

const isGuideEmpty = ({
  things_to_know,
  contact,
  most_important_dashboard,
  important_metrics,
  important_segments,
  important_tables,
} = {}) =>
  things_to_know
    ? false
    : contact && contact.name
      ? false
      : contact && contact.email
        ? false
        : most_important_dashboard
          ? false
          : important_metrics && important_metrics.length !== 0
            ? false
            : important_segments && important_segments.length !== 0
              ? false
              : important_tables && important_tables.length !== 0
                ? false
                : true;

// This function generates a link for each important field of a Metric.
// The link goes to a question comprised of this Metric broken out by
// That important field.
const exploreLinksForMetric = (metricId, guide, metadataFields, tables) => {
  if (guide.metric_important_fields[metricId]) {
    return guide.metric_important_fields[metricId]
      .map(fieldId => metadataFields[fieldId])
      .map(field => ({
        name: field.display_name || field.name,
        url: getQuestionUrl({
          dbId: tables[field.table_id] && tables[field.table_id].db_id,
          tableId: field.table_id,
          fieldId: field.id,
          metricId,
        }),
      }));
  }
};

const mapStateToProps = (state, props) => ({
  guide: getGuide(state, props),
  user: getUser(state, props),
  dashboards: getDashboards(state, props),
  metrics: getMetrics(state, props),
  segments: getSegments(state, props),
  tables: getTables(state, props),
  // FIXME: avoids naming conflict, tried using the propNamespace option
  // version but couldn't quite get it to work together with passing in
  // dynamic initialValues
  metadataFields: getFields(state, props),
  loading: getLoading(state, props),
  // naming this 'error' will conflict with redux form
  loadingError: getError(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  updateDashboard: Dashboards.actions.update,
  createDashboard: Dashboards.actions.create,
  updateSetting,
  clearRequestState,
  ...metadataActions,
  ...actions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GettingStartedGuide extends Component {
  static propTypes = {
    fields: PropTypes.object,
    style: PropTypes.object,
    guide: PropTypes.object,
    user: PropTypes.object,
    dashboards: PropTypes.object,
    metrics: PropTypes.object,
    segments: PropTypes.object,
    tables: PropTypes.object,
    metadataFields: PropTypes.object,
    loadingError: PropTypes.any,
    loading: PropTypes.bool,
    startEditing: PropTypes.func,
  };

  render() {
    const {
      style,
      guide,
      user,
      dashboards,
      metrics,
      segments,
      tables,
      metadataFields,
      loadingError,
      loading,
      startEditing,
    } = this.props;

    return (
      <div className="full relative p3" style={style}>
        <LoadingAndErrorWrapper
          className="full"
          style={style}
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() => (
            <div>
              <GuideHeader
                startEditing={startEditing}
                isSuperuser={user && user.is_superuser}
              />

              <div className="wrapper wrapper--trim">
                {(!guide || isGuideEmpty(guide)) &&
                  user &&
                  user.is_superuser && (
                    <AdminInstructions>
                      <h2 className="py2">{t`Help your team get started with your data.`}</h2>
                      <GuideText>
                        {t`Show your team what’s most important by choosing your top dashboard, metrics, and segments.`}
                      </GuideText>
                      <button
                        className="Button Button--primary"
                        onClick={startEditing}
                      >
                        {t`Get started`}
                      </button>
                    </AdminInstructions>
                  )}

                {guide.most_important_dashboard !== null && [
                  <div className="my2">
                    <SectionHeader key={"dashboardTitle"}>
                      {t`Our most important dashboard`}
                    </SectionHeader>
                    <GuideDetail
                      key={"dashboardDetail"}
                      type="dashboard"
                      entity={dashboards[guide.most_important_dashboard]}
                      tables={tables}
                    />
                  </div>,
                ]}
                {Object.keys(metrics).length > 0 && (
                  <div className="my4 pt4">
                    <SectionHeader trim={guide.important_metrics.length === 0}>
                      {guide.important_metrics &&
                      guide.important_metrics.length > 0
                        ? t`Numbers that we pay attention to`
                        : t`Metrics`}
                    </SectionHeader>
                    {guide.important_metrics &&
                    guide.important_metrics.length > 0 ? (
                      [
                        <div className="my2">
                          {guide.important_metrics.map(metricId => (
                            <GuideDetail
                              key={metricId}
                              type="metric"
                              entity={metrics[metricId]}
                              tables={tables}
                              exploreLinks={exploreLinksForMetric(
                                metricId,
                                guide,
                                metadataFields,
                                tables,
                              )}
                            />
                          ))}
                        </div>,
                      ]
                    ) : (
                      <GuideText>
                        {t`Metrics are important numbers your company cares about. They often represent a core indicator of how the business is performing.`}
                      </GuideText>
                    )}
                    <div>
                      <Link
                        className="Button Button--primary"
                        to={"/reference/metrics"}
                      >
                        {t`See all metrics`}
                      </Link>
                    </div>
                  </div>
                )}

                <div className="mt4 pt4">
                  <SectionHeader
                    trim={
                      !has(guide.important_segments) &&
                      !has(guide.important_tables)
                    }
                  >
                    {Object.keys(segments).length > 0
                      ? t`Segments and tables`
                      : t`Tables`}
                  </SectionHeader>
                  {has(guide.important_segments) ||
                  has(guide.important_tables) ? (
                    <div className="my2">
                      {guide.important_segments.map(segmentId => (
                        <GuideDetail
                          key={segmentId}
                          type="segment"
                          entity={segments[segmentId]}
                          tables={tables}
                        />
                      ))}
                      {guide.important_tables.map(tableId => (
                        <GuideDetail
                          key={tableId}
                          type="table"
                          entity={tables[tableId]}
                          tables={tables}
                        />
                      ))}
                    </div>
                  ) : (
                    <GuideText>
                      {Object.keys(segments).length > 0 ? (
                        <span>
                          {jt`Segments and tables are the building blocks of your company's data. Tables are collections of the raw information while segments are specific slices with specific meanings, like ${(
                            <b>"Recent orders."</b>
                          )}`}
                        </span>
                      ) : (
                        t`Tables are the building blocks of your company's data.`
                      )}
                    </GuideText>
                  )}
                  <div>
                    {Object.keys(segments).length > 0 && (
                      <Link
                        className="Button Button--purple mr2"
                        to={"/reference/segments"}
                      >
                        {t`See all segments`}
                      </Link>
                    )}
                    <Link
                      className={cx(
                        {
                          "text-purple text-bold no-decoration text-underline-hover":
                            Object.keys(segments).length > 0,
                        },
                        {
                          "Button Button--purple":
                            Object.keys(segments).length === 0,
                        },
                      )}
                      to={"/reference/databases"}
                    >
                      {t`See all tables`}
                    </Link>
                  </div>
                </div>

                <div className="mt4 pt4">
                  <SectionHeader trim={!guide.things_to_know}>
                    {guide.things_to_know
                      ? t`Other things to know about our data`
                      : t`Find out more`}
                  </SectionHeader>
                  <GuideText>
                    {guide.things_to_know
                      ? guide.things_to_know
                      : t`A good way to get to know your data is by spending a bit of time exploring the different tables and other info available to you. It may take a while, but you'll start to recognize names and meanings over time.`}
                  </GuideText>
                  <Link
                    className="Button link text-bold"
                    to={"/reference/databases"}
                  >
                    {t`Explore our data`}
                  </Link>
                </div>

                <div className="mt4">
                  {guide.contact &&
                    (guide.contact.name || guide.contact.email) && [
                      <SectionHeader key={"contactTitle"}>
                        {t`Have questions?`}
                      </SectionHeader>,
                      <div className="mb4 pb4" key={"contactDetails"}>
                        {guide.contact.name && (
                          <span className="text-dark mr3">
                            {t`Contact ${guide.contact.name}`}
                          </span>
                        )}
                        {guide.contact.email && (
                          <a
                            className="text-brand text-bold no-decoration"
                            href={`mailto:${guide.contact.email}`}
                          >
                            {guide.contact.email}
                          </a>
                        )}
                      </div>,
                    ]}
                </div>
              </div>
            </div>
          )}
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

const GuideText = (
  { children }, // eslint-disable-line react/prop-types
) => <p className="text-paragraph text-measure">{children}</p>;

const AdminInstructions = (
  { children }, // eslint-disable-line react/prop-types
) => (
  <div className="bordered border-brand rounded p3 text-brand text-measure text-centered bg-light-blue">
    {children}
  </div>
);

const SectionHeader = (
  { trim, children }, // eslint-disable-line react/prop-types
) => (
  <h2 className={cx("text-dark text-measure", { mb0: trim }, { mb4: !trim })}>
    {children}
  </h2>
);
