import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseList from "../components/PulseList.jsx";
import { pulseSelectors } from "../selectors";

@connect(pulseSelectors)
export default class PulseApp extends Component {
    render() {
        return (
            <PulseList { ...this.props } />
        );
    }
}
