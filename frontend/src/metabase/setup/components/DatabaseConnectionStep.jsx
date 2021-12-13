/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { updateIn } from "icepick";

import { Box } from "grid-styled";
import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

import { trackStructEvent } from "metabase/lib/analytics";
import Databases from "metabase/entities/databases";
import {
  trackAddDataLaterClicked,
  trackDatabaseSelected,
} from "metabase/setup/tracking";

export default class DatabaseConnectionStep extends Component {
  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    formName: PropTypes.string.isRequired,
    databaseDetails: PropTypes.object,
    selectedDatabaseEngine: PropTypes.string,
    validateDatabase: PropTypes.func.isRequired,
    setDatabaseDetails: PropTypes.func.isRequired,
  };

  handleSubmit = async database => {
    // validate the details before we move forward
    let formError;
    try {
      // make sure that we are trying ssl db connections to start with
      database.details.ssl = true;
      await this.props.validateDatabase(database);
    } catch (error) {
      formError = error;
      database.details.ssl = false;
      try {
        // ssl connection failed, lets try non-ssl
        await this.props.validateDatabase(database);
        formError = null;
      } catch (error) {
        formError = error;
      }

      if (formError) {
        trackStructEvent(
          "Setup",
          "Error",
          "database validation: " + database.engine,
        );
        // NOTE: need to nest field errors under `details` to get them to appear on the correct fields
        formError = updateIn(formError, ["data", "errors"], errors => ({
          details: errors,
        }));
        throw formError;
      }
    }

    // now that they are good, store them
    this.props.setDatabaseDetails({
      // skip the scheduling step
      nextStep: this.props.stepNumber + 2,
      details: database,
    });

    trackStructEvent("Setup", "Database Step", database.engine);
  };

  skipDatabase = () => {
    const {
      stepNumber,
      selectedDatabaseEngine,
      setDatabaseDetails,
    } = this.props;

    setDatabaseDetails({
      nextStep: stepNumber + 2,
      details: null,
    });

    trackStructEvent("Setup", "Database Step");
    trackAddDataLaterClicked(selectedDatabaseEngine);
  };

  componentDidUpdate(prevProps) {
    const { activeStep, stepNumber, selectedDatabaseEngine } = this.props;

    if (
      activeStep === stepNumber &&
      selectedDatabaseEngine !== prevProps.selectedDatabaseEngine
    ) {
      trackDatabaseSelected(selectedDatabaseEngine);
    }
  }

  render() {
    const {
      activeStep,
      databaseDetails,
      setActiveStep,
      stepNumber,
      formName,
    } = this.props;
    let stepText = t`Add your data`;
    if (activeStep > stepNumber) {
      stepText =
        databaseDetails === null
          ? t`I'll add my own data later`
          : t`Connecting to ${databaseDetails.name}`;
    }

    if (activeStep !== stepNumber) {
      return (
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText={String(stepNumber)}
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
          <StepTitle title={stepText} circleText={String(stepNumber)} />

          <div className="Form-field mb4">
            <div>{t`Are you ready to start exploring your data? Add it below.`}</div>
            <div>{t`Not ready? Skip and play around with our Sample Dataset.`}</div>
          </div>

          <Databases.Form
            formName={formName}
            form={Databases.forms.setup}
            database={databaseDetails}
            onSubmit={this.handleSubmit}
          >
            {({ formFields, Form, FormField, FormFooter }) => (
              <Form>
                {formFields.map(({ name }) => (
                  <FormField key={name} name={name} />
                ))}
                {
                  <FormFooter
                    isReverse={true}
                    submitTitle={t`Connect database`}
                    cancelTitle={t`Skip`}
                    onCancel={this.skipDatabase}
                  />
                }
              </Form>
            )}
          </Databases.Form>
        </Box>
      );
    }
  }
}
