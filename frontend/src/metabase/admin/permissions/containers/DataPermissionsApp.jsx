import React, { Component } from "react";
import { connect } from "react-redux"

import PermissionsApp from "./PermissionsApp.jsx";

import { PermissionsApi } from "metabase/services";
import { loadMetadata } from "../permissions";

@connect(null, { loadMetadata })
export default class DataPermissionsApp extends Component {
    componentWillMount() {
        this.props.loadMetadata();
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
