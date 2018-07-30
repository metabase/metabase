/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";

import title from "metabase/hoc/Title";

import PulseEdit from "../components/PulseEdit.jsx";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import Collections from "metabase/entities/collections";
import Pulses from "metabase/entities/pulses";

import { push, goBack } from "react-router-redux";

import {
  getPulseId,
  getEditingPulse,
  getPulseCardPreviews,
  getPulseFormInput,
} from "../selectors";
import { getUser } from "metabase/selectors/user";

import {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  testPulse,
} from "../actions";

const mapStateToProps = (state, props) => ({
  pulseId: getPulseId(state, props),
  pulse: getEditingPulse(state, props),
  cardPreviews: getPulseCardPreviews(state, props),
  formInput: getPulseFormInput(state, props),
  user: getUser(state),
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
  onChangeLocation: push,
  goBack,
};

@entityListLoader({ entityType: "users" })
@connect(mapStateToProps, mapDispatchToProps)
@title(({ pulse }) => pulse && pulse.name)
export default class PulseEditApp extends Component {
  render() {
    return <PulseEdit {...this.props} />;
  }
}
