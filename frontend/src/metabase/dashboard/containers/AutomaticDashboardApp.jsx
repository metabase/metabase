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

const getDashboardTitle = dashboard => dashboard && dashboard.description;

const getRelatedTableTitle = object =>
  object.title || (object.table && object.table.display_name);
const getRelatedTableDescription = object => object.table && object.description;
const getRelatedTableUrl = object =>
  object.table && `/auto/dashboard/table/${object.table.id}`;

const SuggestionsSidebar = ({ related }) => (
  <div className="flex flex-column full-height">
    <div className="py2 text-centered my3">
      <h3>More X-rays</h3>
    </div>
    <ol className="px2">
      {related.tables.map((s, i) => (
        <li key={i}>
          <Link
            to={getRelatedTableUrl(s)}
            className="bordered rounded bg-white shadowed mb2 p2 flex no-decoration"
          >
            <div
              className="bg-slate-light rounded flex align-center justify-center text-slate mr1 flex-no-shrink"
              style={{ width: 48, height: 48 }}
            >
              <Icon name="bolt" size={22} />
            </div>
            <div>
              <h3 className="m0 mb1">{getRelatedTableTitle(s)}</h3>
              <p className="text-paragraph mt0">
                {getRelatedTableDescription(s)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
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
              <h2>{getDashboardTitle(dashboard)}</h2>
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
        <div className="bg-slate-light full-height" style={{ width: 300 }}>
          {dashboard && <SuggestionsSidebar related={dashboard.related} />}
        </div>
      </div>
    );
  }
}

export default AutomaticDashboardApp;
