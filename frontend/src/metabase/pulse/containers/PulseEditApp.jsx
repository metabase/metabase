import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseEdit from "../components/PulseEdit.jsx";
import { editPulseSelectors } from "../selectors";

@connect(editPulseSelectors)
export default class PulseEditApp extends Component {
    render() {
        return (
            <PulseEdit { ...this.props } />
        );
    }
}
