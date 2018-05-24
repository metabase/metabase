/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import PulseList from "../components/PulseList.jsx";
import { listPulseSelectors } from "../selectors";

import { fetchPulses, fetchPulseFormInput, savePulse } from "../actions";

const mapStateToProps = (state, props) => {
  return {
    ...listPulseSelectors(state, props),
    user: state.currentUser,
    // onChangeLocation: onChangeLocation
  };
};

const mapDispatchToProps = {
  fetchPulses,
  fetchPulseFormInput,
  savePulse,
  onChangeLocation: push,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class PulseListApp extends Component {
  render() {
    return <PulseList {...this.props} />;
  }
}
