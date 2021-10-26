/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { updateIn } from "icepick";

import { Box } from "grid-styled";
import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

import { trackStructEvent } from "metabase/lib/analytics";
import { DEFAULT_SCHEDULES } from "metabase/admin/databases/database";
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

    if (database.details["let-user-control-scheduling"]) {
      // Show the scheduling step if user has chosen to control scheduling manually
      // Add the default schedules because DatabaseSchedulingForm requires them and update the db state
      this.props.setDatabaseDetails({
        nextStep: this.props.stepNumber + 1,
        details: {
          ...database,
          is_full_sync: true,
          schedules: DEFAULT_SCHEDULES,
        },
      });
    } else {
      // now that they are good, store them
      this.props.setDatabaseDetails({
        // skip the scheduling step
        nextStep: this.props.stepNumber + 2,
        details: database,
      });

      trackStructEvent("Setup", "Database Step", database.engine);
    }
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
    trackAddDataLaterClicked(stepNumber, selectedDatabaseEngine);
  };

  componentDidUpdate(prevProps) {
    const { stepNumber, selectedDatabaseEngine } = this.props;

    if (selectedDatabaseEngine !== prevProps.selectedDatabaseEngine) {
      trackDatabaseSelected(stepNumber, selectedDatabaseEngine);
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

          <div className="Form-field">
            {t`You’ll need some info about your database, like the username and password. If you don’t have that right now, Metabase also comes with a sample dataset you can get started with.`}
          </div>

          <Databases.Form
            formName={formName}
            form={Databases.forms.connection}
            database={databaseDetails}
            onSubmit={this.handleSubmit}
          >
            {({ values, formFields, Form, FormField, FormFooter }) => (
              <Form>
                {formFields.map(({ name }) => (
                  <FormField key={name} name={name} />
                ))}
                {values.engine && <FormFooter submitTitle={t`Next`} />}
              </Form>
            )}
          </Databases.Form>

          <div className="mt2">
            <a className="link" onClick={this.skipDatabase}>
              {t`I'll add my data later`}
            </a>
          </div>
        </Box>
      );
    }
  }
}
