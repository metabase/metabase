import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseEdit from "../components/PulseEdit.jsx";
import { editPulseSelectors } from "../selectors";

const mapStateToProps = (state, props) => {
    return {
        ...editPulseSelectors(state, props),
        user: state.currentUser
        // onChangeLocation: onChangeLocation
    }
}

@connect(mapStateToProps)
export default class PulseEditApp extends Component {
    render() {
        return (
            <PulseEdit { ...this.props } />
        );
    }
}
