import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseList from "../components/PulseList.jsx";
import { listPulseSelectors } from "../selectors";

@connect(listPulseSelectors)
export default class PulseListApp extends Component {
    render() {
        return (
            <PulseList { ...this.props } />
        );
    }
}
