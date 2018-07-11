/* @flow weak */

import React from "react";

import { connect } from "react-redux";
import { Link } from "react-router";

import title from "metabase/hoc/Title";
import withToast from "metabase/hoc/Toast";
import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Filter from "metabase/query_builder/components/Filter";

import cxs from "cxs";
import { t } from "c-3po";

import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import DashboardData from "metabase/dashboard/hoc/DashboardData";
import Parameters from "metabase/parameters/components/Parameters";

import { getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";

import { DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";
import MetabaseAnalytics from "metabase/lib/analytics";

import * as Q from "metabase/lib/query/query";
import Dimension from "metabase-lib/lib/Dimension";
import colors from "metabase/lib/colors";

import { dissoc } from "icepick";

const getDashboardId = (state, { params: { splat }, location: { hash } }) =>
  `/auto/dashboard/${splat}${hash.replace(/^#?/, "?")}`;

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state),
  metadata: getMetadata(state),
  dashboardId: getDashboardId(state, props),
});

@connect(mapStateToProps)
@DashboardData
@withToast
@title(({ dashboard }) => dashboard && dashboard.name)
class AutomaticDashboardApp extends React.Component {
  state = {
    savedDashboardId: null,
  };

  componentDidUpdate(prevProps) {
    // scroll to the top when the pathname changes
    if (prevProps.location.pathname !== this.props.location.pathname) {
      window.scrollTo(0, 0);
    }
  }

  save = async () => {
    const { dashboard, triggerToast } = this.props;
    // remove the transient id before trying to save
    const newDashboard = await DashboardApi.save(dissoc(dashboard, "id"));
    triggerToast(
      <div className="flex align-center">
        <Icon
          name="dashboard"
          size={22}
          className="mr2"
          color={colors["text-medium"]}
        />
        {t`Your dashboard was saved`}
        <Link
          className="link text-bold ml1"
          to={Urls.dashboard(newDashboard.id)}
        >
          {t`See it`}
        </Link>
      </div>,
    );

    this.setState({ savedDashboardId: newDashboard.id });
    MetabaseAnalytics.trackEvent("AutoDashboard", "Save");
  };

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      setParameterValue,
      location,
      isAdmin,
    } = this.props;
    const { savedDashboardId } = this.state;
    // pull out "more" related items for displaying as a button at the bottom of the dashboard
    const more = dashboard && dashboard.more;
    const related = dashboard && dashboard.related;
    const hasSidebar = related && related.length > 0;

    return (
      <div className="relative">
        <div className="" style={{ marginRight: hasSidebar ? 346 : undefined }}>
          <div className="bg-white border-bottom py2">
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr2" size={24} />
              <div>
                <h2>{dashboard && <TransientTitle dashboard={dashboard} />}</h2>
                {dashboard &&
                  dashboard.transient_filters && (
                    <TransientFilters
                      filter={dashboard.transient_filters}
                      metadata={this.props.metadata}
                    />
                  )}
              </div>
              {savedDashboardId != null ? (
                <Button className="ml-auto" disabled>{t`Saved`}</Button>
              ) : isAdmin ? (
                <ActionButton
                  className="ml-auto"
                  success
                  borderless
                  actionFn={this.save}
                >
                  {t`Save this`}
                </ActionButton>
              ) : null}
            </div>
          </div>

          <div className="wrapper pb4">
            {parameters &&
              parameters.length > 0 && (
                <div className="px1 pt1">
                  <Parameters
                    parameters={parameters.map(p => ({
                      ...p,
                      value: parameterValues && parameterValues[p.id],
                    }))}
                    query={location.query}
                    setParameterValue={setParameterValue}
                    syncQueryString
                    isQB
                  />
                </div>
              )}
            <Dashboard {...this.props} />
          </div>
          {more && (
            <div className="flex justify-end px4 pb4">
              <Link
                to={more}
                className="ml2"
                onClick={() =>
                  MetabaseAnalytics.trackEvent("AutoDashboard", "ClickMore")
                }
              >
                <Button iconRight="chevronright">{t`Show more about this`}</Button>
              </Link>
            </div>
          )}
        </div>
        {hasSidebar && (
          <div className="Layout-sidebar absolute top right bottom">
            <SuggestionsSidebar related={related} />
          </div>
        )}
      </div>
    );
  }
}

const TransientTitle = ({ dashboard }) =>
  dashboard.transient_name ? (
    <span>{dashboard.transient_name}</span>
  ) : dashboard.name ? (
    <span>{dashboard.name}</span>
  ) : null;

const TransientFilters = ({ filter, metadata }) => (
  <div className="mt1 flex align-center text-grey-4 text-bold">
    {/* $FlowFixMe */}
    {Q.getFilters({ filter }).map((f, index) => (
      <TransientFilter key={index} filter={f} metadata={metadata} />
    ))}
  </div>
);

const TransientFilter = ({ filter, metadata }) => (
  <div className="mr3">
    <Icon size={12} name={getIconForFilter(filter, metadata)} className="mr1" />
    <Filter filter={filter} metadata={metadata} />
  </div>
);

const getIconForFilter = (filter, metadata) => {
  const field = Dimension.parseMBQL(filter[1], metadata).field();
  if (field.isDate()) {
    return "calendar";
  } else if (field.isLocation()) {
    return "location";
  } else {
    return "label";
  }
};

const suggestionClasses = cxs({
  ":hover h3": {
    color: colors["brand"],
  },
  ":hover .Icon": {
    color: colors["warning"],
  },
});

const SuggestionsList = ({ suggestions, section }) => (
  <ol className="px2">
    {suggestions.map((s, i) => (
      <li key={i} className={suggestionClasses}>
        <Link
          to={s.url}
          className="bordered rounded bg-white shadowed mb2 p2 flex no-decoration"
          onClick={() =>
            MetabaseAnalytics.trackEvent(
              "AutoDashboard",
              "ClickRelated",
              section,
            )
          }
        >
          <div
            className="bg-slate-extra-light rounded flex align-center justify-center text-slate mr1 flex-no-shrink"
            style={{ width: 48, height: 48 }}
          >
            <Icon name="bolt" className="Icon text-grey-1" size={22} />
          </div>
          <div>
            <h3 className="m0 mb1 ml1">{s.title}</h3>
            <p className="text-grey-4 ml1 mt0 mb0">{s.description}</p>
          </div>
        </Link>
      </li>
    ))}
  </ol>
);

const SuggestionsSidebar = ({ related }) => (
  <div className="flex flex-column bg-slate-almost-extra-light full-height">
    <div className="py2 text-centered my3">
      <h3 className="text-grey-3">More X-rays</h3>
    </div>
    <SuggestionsList section="related" suggestions={related} />
  </div>
);

export default AutomaticDashboardApp;
