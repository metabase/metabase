import React from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";

import ActionButton from "metabase/components/ActionButton";
import Icon from "metabase/components/Icon";

import { Dashboard } from "./Dashboard";
import DashboardData from "metabase/dashboard/hoc/DashboardData";

import { DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

import { dissoc } from "icepick";

const SuggestionsList = ({ suggestions }) => (
  <ol className="px2">
    {suggestions.map((s, i) => (
      <li key={i}>
        <Link
          to={s.url}
          className="bordered rounded bg-white shadowed mb2 p2 flex no-decoration"
        >
          <div
            className="bg-slate-light rounded flex align-center justify-center text-slate mr1 flex-no-shrink"
            style={{ width: 48, height: 48 }}
          >
            <Icon name="bolt" size={22} />
          </div>
          <div>
            <h3 className="m0 mb1">{s.title}</h3>
            <p className="text-paragraph mt0">{s.description}</p>
          </div>
        </Link>
      </li>
    ))}
  </ol>
);

const SuggestionsSidebar = ({ related }) => (
  <div className="flex flex-column full-height">
    <div className="py2 text-centered my3">
      <h3>More X-rays</h3>
    </div>
    {Object.values(related).map(suggestions => (
      <SuggestionsList suggestions={suggestions} />
    ))}
    <div className="mt-auto border-top px2 py4">
      <div className="flex align-center justify-center ml-auto mr-auto text-brand-hover">
        <Icon name="refresh" className="mr1" />
        <span className="text-bold">See something else</span>
      </div>
    </div>
  </div>
);

const getDashboardId = (state, { params: { type, subtype, id } }) =>
  `/auto/${type}/${subtype}/${id}`;

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
    const { dashboard } = this.props;
    return (
      <div className="flex full-height">
        <div className="flex flex-column" style={{ flex: 1 }}>
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
          <div className="px3 pb4 bg-slate-extra-light">
            <Dashboard {...this.props} />
          </div>
        </div>
        {dashboard &&
          dashboard.related && (
            <div className="bg-slate-light full-height" style={{ width: 300 }}>
              <SuggestionsSidebar related={dashboard.related} />
            </div>
          )}
      </div>
    );
  }
}

export default AutomaticDashboardApp;
