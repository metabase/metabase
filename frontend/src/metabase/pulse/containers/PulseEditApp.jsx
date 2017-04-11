/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import title from "metabase/hoc/Title";

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
@title(({ pulse }) => pulse && pulse.name)
export default class PulseEditApp extends Component {
    render() {
        return (
            <PulseEdit { ...this.props } />
        );
    }
}
