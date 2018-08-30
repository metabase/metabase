/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import StepTitle from "./StepTitle.jsx";
import CollapsedStep from "./CollapsedStep.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

import DatabaseSchedulingForm from "metabase/admin/databases/components/DatabaseSchedulingForm";
import Icon from "metabase/components/Icon";

export default class DatabaseSchedulingStep extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { engine: "", formError: null };
  }

  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    databaseDetails: PropTypes.object,
    setDatabaseDetails: PropTypes.func.isRequired,
  };

  schedulingDetailsCaptured = async database => {
    this.props.setDatabaseDetails({
      nextStep: this.props.stepNumber + 1,
      details: database,
    });

    MetabaseAnalytics.trackEvent("Setup", "Database Step", this.state.engine);
  };

  render() {
    let { activeStep, databaseDetails, setActiveStep, stepNumber } = this.props;
    let { formError } = this.state;

    let stepText = t`Control automatic scans`;

    const schedulingIcon = (
      <Icon
        className="text-purple-hover cursor-pointer"
        name="gear"
        onClick={() =>
          this.setState({ showCalendar: !this.state.showCalendar })
        }
      />
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
        <section className="SetupStep bg-white rounded full relative SetupStep--active">
          <StepTitle title={stepText} circleText={schedulingIcon} />
          <div className="mb4">
            <div className="text-default">
              <DatabaseSchedulingForm
                database={databaseDetails}
                formState={{ formError }}
                // Use saveDatabase both for db creation and updating
                save={this.schedulingDetailsCaptured}
                submitButtonText={t`Next`}
              />
            </div>
          </div>
        </section>
      );
    }
  }
}
