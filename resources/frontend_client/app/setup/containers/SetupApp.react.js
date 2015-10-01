"use strict";

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Setup from "../components/Setup.react";
import { setupSelectors } from "../selectors";

@connect(setupSelectors)
export default class SetupApp extends Component {
    render() {
        return <Setup {...this.props} />;
    }
}
