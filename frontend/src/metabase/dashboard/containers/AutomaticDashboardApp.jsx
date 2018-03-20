import React from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";
import { withBackground } from "metabase/hoc/Background";
import ActionButton from "metabase/components/ActionButton";
import Icon from "metabase/components/Icon";
import cxs from "cxs";

import { Dashboard } from "./Dashboard";
import DashboardData from "metabase/dashboard/hoc/DashboardData";
import Parameters from "metabase/parameters/components/Parameters";

import { DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

import { dissoc } from "icepick";

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
  <div className="flex flex-column">
    <div className="py2 text-centered my3">
      <h3>More explorations</h3>
    </div>
    {Object.values(related).map(suggestions => (
      <SuggestionsList suggestions={suggestions} />
    ))}
  </div>
);

const getDashboardId = (state, { params: { splat } }) =>
  `/auto/dashboard/${splat}`;

const mapStateToProps = (state, props) => ({
  dashboardId: getDashboardId(state, props),
});

@connect(mapStateToProps, { push })
@DashboardData
class AutomaticDashboardApp extends React.Component {
  save = async () => {
    const { dashboard, push } = this.props;
    // remove the transient id before trying to save
    const newDashboard = await DashboardApi.save(dissoc(dashboard, "id"));
    push(Urls.dashboard(newDashboard.id));
  };

  render() {
    const {
      dashboard,
      parameters,
      parameterValues,
      setParameterValue,
      location,
    } = this.props;
    return (
      <div className="flex">
        <div className="flex-full">
          <div className="bg-white border-bottom py2">
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr1" size={24} />
              <h2>{dashboard && dashboard.name}</h2>
              <ActionButton
                className="ml-auto bg-green text-white"
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
        {dashboard &&
          dashboard.related && (
            <div className="Layout-sidebar flex-no-shrink">
              <SuggestionsSidebar related={dashboard.related} />
            </div>
          )}
      </div>
    );
  }
}

export default withBackground("bg-slate-extra-light")(AutomaticDashboardApp);
