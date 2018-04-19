/* @flow weak */

import React from "react";

import { connect } from "react-redux";
import { Link } from "react-router";

import { withBackground } from "metabase/hoc/Background";
import ActionButton from "metabase/components/ActionButton";
import Icon from "metabase/components/Icon";

import cxs from "cxs";
import { t } from "c-3po";

import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import DashboardData from "metabase/dashboard/hoc/DashboardData";
import Parameters from "metabase/parameters/components/Parameters";

import { getMetadata } from "metabase/selectors/metadata";
import { addUndo, createUndo } from "metabase/redux/undo";

import { DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

import { getParameterIconName } from "metabase/meta/Parameter";

import { dissoc } from "icepick";

const getDashboardId = (state, { params: { splat }, location: { hash } }) =>
  `/auto/dashboard/${splat}${hash.replace(/^#?/, "?")}`;

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
  dashboardId: getDashboardId(state, props),
});

@connect(mapStateToProps, { addUndo, createUndo })
@DashboardData
class AutomaticDashboardApp extends React.Component {
  componentDidUpdate(prevProps) {
    // scroll to the top when the pathname changes
    if (prevProps.location.pathname !== this.props.location.pathname) {
      window.scrollTo(0, 0);
    }
  }

  save = async () => {
    const { dashboard, addUndo, createUndo } = this.props;
    // remove the transient id before trying to save
    const newDashboard = await DashboardApi.save(dissoc(dashboard, "id"));
    addUndo(
      createUndo({
        type: "metabase/automatic-dashboards/link-to-created-object",
        message: () => (
          <div className="flex align-center">
            <Icon name="dashboard" size={22} className="mr2" />
            <Link className="link" to={Urls.dashboard(newDashboard.id)}>
              {t`View your recently created dashboard`}
            </Link>
          </div>
        ),
        action: null,
      }),
    );
  };

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      setParameterValue,
      location,
    } = this.props;
    const relatedCount =
      (dashboard &&
        dashboard.related &&
        Object.values(dashboard.related).reduce(
          (acc, list) => acc + list.length,
          0,
        )) ||
      0;
    return (
      <div className="flex">
        <div className="flex-full overflow-x-hidden">
          <div className="bg-white border-bottom py2">
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr2" size={24} />
              <div>
                <h2>{dashboard && <TransientTitle dashboard={dashboard} />}</h2>
                {dashboard &&
                  dashboard.transient_filters &&
                  dashboard.transient_filters.length > 0 && (
                    <TransientFilters filters={dashboard.transient_filters} />
                  )}
              </div>
              <ActionButton
                className="ml-auto Button--success"
                borderless
                actionFn={this.save}
              >
                Save this
              </ActionButton>
            </div>
          </div>

          <div className="px3 pb4">
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
        </div>
        {relatedCount > 0 && (
          <div className="Layout-sidebar flex-no-shrink">
            <SuggestionsSidebar related={dashboard.related} />
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

const TransientFilters = ({ filters }) => (
  <div className="mt1 flex align-center text-grey-4 text-bold">
    {filters.map((filter, index) => (
      <TransientFilter key={index} filter={filter} />
    ))}
  </div>
);

const TransientFilter = ({ filter }) => (
  <div className="mr3">
    <Icon name={getParameterIconName(filter.type)} size={12} className="mr1" />
    {filter.field.map((str, index) => [
      <span key={"name" + index}>{str}</span>,
      index !== filter.field.length - 1 ? (
        <Icon
          key={"icon" + index}
          size={10}
          style={{ marginLeft: 3, marginRight: 3 }}
          name="connections"
        />
      ) : null,
    ])}
    <span> {filter.value}</span>
  </div>
);

const suggestionClasses = cxs({
  ":hover h3": {
    color: "#509ee3",
  },
  ":hover .Icon": {
    color: "#F9D45C",
  },
});

const SuggestionsList = ({ suggestions }) => (
  <ol className="px2">
    {suggestions.map((s, i) => (
      <li key={i} className={suggestionClasses}>
        <Link
          to={s.url}
          className="bordered rounded bg-white shadowed mb2 p2 flex no-decoration"
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
    {Object.values(related).map(suggestions => (
      <SuggestionsList suggestions={suggestions} />
    ))}
  </div>
);

export default withBackground("bg-slate-extra-light")(AutomaticDashboardApp);
