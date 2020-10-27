/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";
import { Box } from "grid-styled";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import Toggle from "metabase/components/Toggle";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

export default class PreferencesStep extends Component {
  state = { errorMessage: null };

  static propTypes = {
    stepNumber: PropTypes.number.isRequired,
    activeStep: PropTypes.number.isRequired,
    setActiveStep: PropTypes.func.isRequired,

    allowTracking: PropTypes.bool.isRequired,
    setAllowTracking: PropTypes.func.isRequired,
    setupComplete: PropTypes.bool.isRequired,
    submitSetup: PropTypes.func.isRequired,
  };

  toggleTracking() {
    const { allowTracking } = this.props;

    this.props.setAllowTracking(!allowTracking);
  }

  async formSubmitted(e) {
    e.preventDefault();

    // okay, this is the big one.  we actually submit everything to the api now and complete the process.
    const { payload } = await this.props.submitSetup();
    // a successful payload is null
    const errorMessage =
      payload && payload.data ? getErrorMessage(payload.data) : null;
    this.setState({ errorMessage });

    MetabaseAnalytics.trackEvent(
      "Setup",
      "Preferences Step",
      this.props.allowTracking,
    );
  }

  render() {
    const {
      activeStep,
      allowTracking,
      setupComplete,
      stepNumber,
      setActiveStep,
    } = this.props;

    let stepText = t`Usage data preferences`;
    if (setupComplete) {
      stepText = allowTracking
        ? t`Thanks for helping us improve`
        : t`We won't collect any usage events`;
    }

    if (activeStep !== stepNumber || setupComplete) {
      return (
        // The -1 is here because we don't display a number for the optional
        // database scheduling step. So this is the 5th possible step, but
        // only the 4th numbered step.
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText={String(stepNumber - 1)}
          stepText={stepText}
          isCompleted={setupComplete}
          setActiveStep={setActiveStep}
        />
      );
    } else {
      return (
        <Box
          p={4}
          className="SetupStep bg-white rounded full relative SetupStep--active"
        >
          <StepTitle title={stepText} circleText={String(stepNumber - 1)} />
          <form onSubmit={this.formSubmitted.bind(this)} noValidate>
            <div className="Form-field">
              {t`In order to help us improve Metabase, we'd like to collect certain data about usage through Google Analytics.`}{" "}
              <a
                className="link"
                href={MetabaseSettings.docsUrl("information-collection")}
                target="_blank"
              >{t`Here's a full list of everything we track and why.`}</a>
            </div>

            <div className="Form-field mr4">
              <div
                style={{ borderWidth: "2px" }}
                className="flex align-center bordered rounded p2"
              >
                <Toggle
                  value={allowTracking}
                  onChange={this.toggleTracking.bind(this)}
                  className="inline-block"
                  aria-labelledby="anonymous-usage-events-label"
                />
                <span className="ml1" id="anonymous-usage-events-label">
                  {t`Allow Metabase to anonymously collect usage events`}
                </span>
              </div>
            </div>

            {allowTracking ? (
              <div className="Form-field">
                <ul style={{ listStyle: "disc inside", lineHeight: "200%" }}>
                  <li>{jt`Metabase ${(
                    <span style={{ fontWeight: "bold" }}>{t`never`}</span>
                  )} collects anything about your data or question results.`}</li>
                  <li>{t`All collection is completely anonymous.`}</li>
                  <li>{t`Collection can be turned off at any point in your admin settings.`}</li>
                </ul>
              </div>
            ) : null}

            <div className="Form-actions">
              <button className="Button Button--primary">{t`Next`}</button>
              {/* FIXME: <mb-form-message form="usageForm"></mb-form-message>*/}
              {this.state.errorMessage && (
                <div className="text-error ml1">{this.state.errorMessage}</div>
              )}
            </div>
          </form>
        </Box>
      );
    }
  }
}

function getErrorMessage(data) {
  const { errors, message } = data;
  if (message) {
    return message;
  }
  if (errors) {
    return Object.values(errors)[0];
  }
  return null;
}
