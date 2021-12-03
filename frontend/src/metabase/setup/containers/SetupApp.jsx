/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import { connect } from "react-redux";
import fitViewport from "metabase/hoc/FitViewPort";

import Setup from "../components/Setup";

import { setupSelectors } from "../selectors";
import {
  setUserDetails,
  validatePassword,
  setActiveStep,
  validateDatabase,
  setDatabaseEngine,
  setDatabaseDetails,
  setLanguageDetails,
  setAllowTracking,
  submitSetup,
} from "../actions";
import { DATABASE_FORM_NAME } from "metabase/setup/constants";

const mapStateToProps = setupSelectors;

const mapDispatchToProps = {
  setLanguageDetails,
  setUserDetails,
  setDatabaseEngine,
  setDatabaseDetails,
  validatePassword,
  setActiveStep,
  validateDatabase,
  setAllowTracking,
  submitSetup,
};

@connect(mapStateToProps, mapDispatchToProps)
@fitViewport
export default class SetupApp extends Component {
  render() {
    return <Setup {...this.props} databaseFormName={DATABASE_FORM_NAME} />;
  }
}
