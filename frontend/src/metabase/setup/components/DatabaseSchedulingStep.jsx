/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Box } from "grid-styled";
import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";
import Icon from "metabase/components/Icon";

import Databases from "metabase/entities/databases";

import MetabaseAnalytics from "metabase/lib/analytics";

export default class DatabaseSchedulingStep extends Component {
  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    databaseDetails: PropTypes.object,
    setDatabaseDetails: PropTypes.func.isRequired,
  };

  handleSubmit = async database => {
    this.props.setDatabaseDetails({
      nextStep: this.props.stepNumber + 1,
      details: database,
    });

    MetabaseAnalytics.trackEvent("Setup", "Database Step", this.state.engine);
  };

  render() {
    const {
      activeStep,
      databaseDetails,
      setActiveStep,
      stepNumber,
    } = this.props;

    const stepText = t`Control automatic scans`;

    const schedulingIcon = (
      <Icon className="text-purple-hover cursor-pointer" name="gear" />
    );

    if (activeStep !== stepNumber) {
      return (
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText={schedulingIcon}
          stepText={stepText}
          isCompleted={activeStep > stepNumber}
          setActiveStep={setActiveStep}
        />
      );
    } else {
      return (
        <Box
          p={4}
          className="SetupStep bg-white rounded full relative SetupStep--active"
        >
          <StepTitle title={stepText} circleText={schedulingIcon} />

          <Databases.Form
            form={Databases.forms.scheduling}
            database={databaseDetails}
            onSubmit={this.handleSubmit}
            submitTitle={t`Next`}
          />
        </Box>
      );
    }
  }
}
