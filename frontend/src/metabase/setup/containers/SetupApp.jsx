/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";

import Setup from "../components/Setup.jsx";

import { setupSelectors } from "../selectors";
import {
    setUserDetails,
    validatePassword,
    setActiveStep,
    validateDatabase,
    setDatabaseDetails,
    setAllowTracking,
    submitSetup,
} from "../actions";

const mapStateToProps = setupSelectors;

const mapDispatchToProps = {
    setUserDetails,
    validatePassword,
    setActiveStep,
    validateDatabase,
    setDatabaseDetails,
    setAllowTracking,
    submitSetup
};

@connect(mapStateToProps, mapDispatchToProps)
export default class SetupApp extends Component {
    render() {
        return <Setup {...this.props} />;
    }
}
