import React, { Component } from "react";
import { connect } from "react-redux";

import fitViewport from "metabase/hoc/FitViewPort";

import PermissionsApp from "./PermissionsApp.jsx";

import { PermissionsApi } from "metabase/services";
import { fetchRealDatabases } from "metabase/redux/metadata";

@connect(null, { fetchRealDatabases })
@fitViewport
export default class DataPermissionsApp extends Component {
  componentWillMount() {
    this.props.fetchRealDatabases(true);
  }
  render() {
    return (
      <PermissionsApp
        {...this.props}
        load={PermissionsApi.graph}
        save={PermissionsApi.updateGraph}
        fitClassNames={this.props.fitClassNames + " flex-column"}
      />
    );
  }
}
