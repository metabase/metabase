import React, { Component } from "react";
import { connect } from "react-redux"

import PermissionsApp from "./PermissionsApp.jsx";

import { PermissionsApi } from "metabase/services";
import { fetchDatabases } from "metabase/redux/metadata";

@connect(null, { fetchDatabases })
export default class DataPermissionsApp extends Component {
    componentWillMount() {
        this.props.fetchDatabases();
    }
    render() {
        return (
            <PermissionsApp
                {...this.props}
                load={PermissionsApi.graph}
                save={PermissionsApi.updateGraph}
            />
        );
    }
}
