/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import PulseEdit from "../components/PulseEdit.jsx";

import { editPulseSelectors } from "../selectors";
import {
    setEditingPulse,
    updateEditingPulse,
    saveEditingPulse,
    deletePulse,
    fetchCards,
    fetchUsers,
    fetchPulseFormInput,
    fetchPulseCardPreview,
    testPulse,
} from "../actions";

const mapStateToProps = (state, props) => {
    return {
        ...editPulseSelectors(state, props),
        user: state.currentUser
    }
}

const mapDispatchToProps = {
    setEditingPulse,
    updateEditingPulse,
    saveEditingPulse,
    deletePulse,
    fetchCards,
    fetchUsers,
    fetchPulseFormInput,
    fetchPulseCardPreview,
    testPulse,
    onChangeLocation: push
};

@connect(mapStateToProps, mapDispatchToProps)
export default class PulseEditApp extends Component {
    render() {
        return (
            <PulseEdit { ...this.props } />
        );
    }
}
