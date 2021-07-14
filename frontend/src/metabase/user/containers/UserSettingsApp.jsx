/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";

import UserSettings from "../components/UserSettings";
import { selectors } from "../selectors";

import {
  setTab,
  updatePassword,
  updateUser,
  validatePassword,
} from "../actions";

const mapStateToProps = (state, props) => {
  return {
    ...selectors(state),
    user: state.currentUser,
  };
};

const mapDispatchToProps = {
  setTab,
  updatePassword,
  updateUser,
  validatePassword,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class UserSettingsApp extends Component {
  render() {
    return <UserSettings {...this.props} />;
  }
}
