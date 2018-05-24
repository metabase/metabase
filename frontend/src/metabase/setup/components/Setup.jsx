/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "c-3po";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import NewsletterForm from "metabase/components/NewsletterForm.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import UserStep from "./UserStep.jsx";
import DatabaseConnectionStep from "./DatabaseConnectionStep.jsx";
import PreferencesStep from "./PreferencesStep.jsx";
import DatabaseSchedulingStep from "metabase/setup/components/DatabaseSchedulingStep";

const WELCOME_STEP_NUMBER = 0;
const USER_STEP_NUMBER = 1;
const DATABASE_CONNECTION_STEP_NUMBER = 2;
const DATABASE_SCHEDULING_STEP_NUMBER = 3;
const PREFERENCES_STEP_NUMBER = 4;

export default class Setup extends Component {
  static propTypes = {
    activeStep: PropTypes.number.isRequired,
    setupComplete: PropTypes.bool.isRequired,
    userDetails: PropTypes.object,
    setActiveStep: PropTypes.func.isRequired,
    databaseDetails: PropTypes.object.isRequired,
  };

  completeWelcome() {
    this.props.setActiveStep(USER_STEP_NUMBER);
    MetabaseAnalytics.trackEvent("Setup", "Welcome");
  }

  completeSetup() {
    MetabaseAnalytics.trackEvent("Setup", "Complete");
  }

  renderFooter() {
    const { tag } = MetabaseSettings.get("version");
    return (
      <div className="SetupHelp bordered border-dashed p2 rounded mb4">
        {t`If you feel stuck`},{" "}
        <a
          className="link"
          href={
            "http://www.metabase.com/docs/" + tag + "/setting-up-metabase.html"
          }
          target="_blank"
        >{t`our getting started guide`}</a>{" "}
        {t`is just a click away.`}
      </div>
    );
  }

  componentWillReceiveProps(nextProps) {
    // If we are entering the scheduling step, we need to scroll to the top of scheduling step container
    if (
      this.props.activeStep !== nextProps.activeStep &&
      nextProps.activeStep === 3
    ) {
      setTimeout(() => {
        if (this.refs.databaseSchedulingStepContainer) {
          const node = ReactDOM.findDOMNode(
            this.refs.databaseSchedulingStepContainer,
          );
          node && node.scrollIntoView && node.scrollIntoView();
        }
      }, 10);
    }
  }

  render() {
    let {
      activeStep,
      setupComplete,
      databaseDetails,
      userDetails,
    } = this.props;

    if (activeStep === WELCOME_STEP_NUMBER) {
      return (
        <div className="relative full-height flex flex-full layout-centered">
          <div className="wrapper wrapper--trim text-centered">
            <LogoIcon className="text-brand mb4" width={89} height={118} />
            <div
              className="relative z2 text-centered ml-auto mr-auto"
              style={{ maxWidth: 550 }}
            >
              <h1
                style={{ fontSize: "2.2rem" }}
                className="text-brand"
              >{t`Welcome to Metabase`}</h1>
              <p className="text-body">{t`Looks like everything is working. Now let’s get to know you, connect to your data, and start finding you some answers!`}</p>
              <button
                className="Button Button--primary mt4"
                onClick={() => this.completeWelcome()}
              >{t`Let's get started`}</button>
            </div>
            <div className="absolute z1 bottom left right">
              <div className="inline-block">{this.renderFooter()}</div>
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div>
          <nav className="SetupNav text-brand py2 flex layout-centered">
            <LogoIcon width={41} height={51} />
          </nav>

          <div className="wrapper wrapper--small">
            <div className="SetupSteps full">
              <UserStep {...this.props} stepNumber={USER_STEP_NUMBER} />
              <DatabaseConnectionStep
                {...this.props}
                stepNumber={DATABASE_CONNECTION_STEP_NUMBER}
              />

              {/* Have the ref for scrolling in componentWillReceiveProps */}
              <div ref="databaseSchedulingStepContainer">
                {/* Show db scheduling step only if the user has explicitly set the "Let me choose when Metabase syncs and scans" toggle to true */}
                {databaseDetails &&
                  databaseDetails.details &&
                  databaseDetails.details["let-user-control-scheduling"] && (
                    <DatabaseSchedulingStep
                      {...this.props}
                      stepNumber={DATABASE_SCHEDULING_STEP_NUMBER}
                    />
                  )}
              </div>
              <PreferencesStep
                {...this.props}
                stepNumber={PREFERENCES_STEP_NUMBER}
              />

              {setupComplete ? (
                <section className="SetupStep rounded SetupStep--active flex flex-column layout-centered p4">
                  <h1
                    style={{ fontSize: "xx-large" }}
                    className="text-light pt2 pb2"
                  >{t`You're all set up!`}</h1>
                  <div className="pt4">
                    <NewsletterForm
                      initialEmail={userDetails && userDetails.email}
                    />
                  </div>
                  <div className="pt4 pb2">
                    <Link
                      to="/explore"
                      className="Button Button--primary"
                      onClick={this.completeSetup.bind(this)}
                    >{t`Take me to Metabase`}</Link>
                  </div>
                </section>
              ) : null}
              <div className="text-centered">{this.renderFooter()}</div>
            </div>
          </div>
        </div>
      );
    }
  }
}
