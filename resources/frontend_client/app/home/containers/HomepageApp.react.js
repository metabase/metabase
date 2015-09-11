"use strict";

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Homepage from "../components/Homepage.react";
import { homepageSelectors } from "../selectors";

@connect(homepageSelectors)
export default class HomepageApp extends Component {
    render() {
        return <Homepage {...this.props} />;
    }
}
