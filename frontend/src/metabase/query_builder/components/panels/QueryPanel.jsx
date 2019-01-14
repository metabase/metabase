import React from "react";

import QuerySections from "../worksheet/QuerySections";

import Toggle from "metabase/components/Toggle";

export default class QueryPanel extends React.Component {
  render() {
    return (
      <div>
        <QuerySections {...this.props} />
        <div className="flex align-center">
          <span>Auto-refresh:</span>
          <Toggle
            small
            value={this.props.uiControls.isAutoRefreshing}
            onChange={this.props.toggleAutoRefresh}
          />
        </div>
      </div>
    );
  }
}
