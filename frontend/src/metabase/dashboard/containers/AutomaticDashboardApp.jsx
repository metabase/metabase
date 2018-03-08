import React from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import Dashboard from "./Dashboard";

import { AutoApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

const SuggestionsSidebar = ({ suggestions }) => (
  <div className="flex flex-column full-height">
    <div className="py2 text-centered my3">
      <h3>More X-rays</h3>
    </div>
    <ol className="px2">
      {suggestions.map((s, i) => (
        <li className="bordered rounded bg-white shadowed mb2 p2 flex" key={i}>
          <div
            className="bg-slate-light rounded flex align-center justify-center text-slate mr1"
            style={{ width: 48, height: 48 }}
          >
            <Icon name="bolt" size={22} />
          </div>
          <div>
            <h3 className="m0 mb1">{s.name}</h3>
            <p className="text-paragraph mt0">{s.description}</p>
          </div>
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

SuggestionsSidebar.defaultProps = {
  suggestions: [
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
  ],
};

@connect(null, { push })
class AutomaticDashboardApp extends React.Component {
  save = async () => {
    const { params: { subtype, id }, push } = this.props;
    const result = await AutoApi.saveDashboard({ type: subtype, id });
    // FIXME: the endpoint should only be saving one dashboard and returning one ID
    const dashId = Array.isArray(result) ? result[0] : result;
    push(Urls.dashboard(dashId));
  };

  render() {
    const { params: { type, subtype, id } } = this.props;
    const dashboardId = `/auto/${type}/${subtype}/${id}`;
    return (
      <div className="flex full-height">
        <div className="flex flex-column" style={{ flex: 1 }}>
          <div className="bg-white border-bottom py2">
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr1" size={24} />
              <h2>
                Here are some things we thought were interesting in your FIXME
                table.
              </h2>
              <Button
                className="ml-auto bg-green text-white"
                borderless
                onClick={this.save}
              >
                Save this
              </Button>
            </div>
          </div>
          <div className="px3 pb4 bg-slate-extra-light">
            <Dashboard dashboardId={dashboardId} />
          </div>
        </div>
        <div className="bg-slate-light full-height" style={{ width: 300 }}>
          <SuggestionsSidebar />
        </div>
      </div>
    );
  }
}

export default AutomaticDashboardApp;
