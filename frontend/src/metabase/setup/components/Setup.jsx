/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { trackStructEvent } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import AddDatabaseHelpCard from "metabase/components/AddDatabaseHelpCard";
import ExternalLink from "metabase/components/ExternalLink";
import LogoIcon from "metabase/components/LogoIcon";
import NewsletterForm from "metabase/components/NewsletterForm";

import LanguageStep from "./LanguageStep";
import UserStep from "./UserStep";
import DatabaseConnectionStep from "./DatabaseConnectionStep";
import PreferencesStep from "./PreferencesStep";
import { AddDatabaseHelpCardHolder } from "./Setup.styled";

import { SetupApi } from "metabase/services";

import {
  COMPLETED_STEP_NUMBER,
  DATABASE_CONNECTION_STEP_NUMBER,
  LANGUAGE_STEP_NUMBER,
  PREFERENCES_STEP_NUMBER,
  USER_STEP_NUMBER,
  WELCOME_STEP_NUMBER,
} from "../constants";
import { trackStepSeen } from "../tracking";

export default class Setup extends Component {
  static propTypes = {
    location: PropTypes.object.isRequired,
    activeStep: PropTypes.number.isRequired,
    setupComplete: PropTypes.bool.isRequired,
    userDetails: PropTypes.object,
    languageDetails: PropTypes.object,
    setActiveStep: PropTypes.func.isRequired,
    databaseFormName: PropTypes.string.isRequired,
    databaseDetails: PropTypes.object,
    selectedDatabaseEngine: PropTypes.string,
    setDatabaseEngine: PropTypes.func,
  };

  constructor(props) {
    super(props);
  }

  completeWelcome() {
    this.props.setActiveStep(LANGUAGE_STEP_NUMBER);
    trackStructEvent("Setup", "Welcome");
  }

  async componentDidMount() {
    this.trackStepSeen();
    this.setDefaultLanguage();
    await this.setDefaultDetails();
  }

  setDefaultLanguage() {
    const locales = MetabaseSettings.get("available-locales") || [];
    const browserLocale = (navigator.language || "").toLowerCase();
    const defaultLanguage =
      // try to find an exact match (e.g. "zh-tw")
      locales.find(([code]) => code.toLowerCase() === browserLocale) ||
      // fall back to matching the prefix (e.g. just "zh" from "zh-tw")
      locales.find(
        ([code]) => code.toLowerCase() === browserLocale.split("-")[0],
      ) ||
      // if our locale list doesn't include the navigator language, pick English
      locales.find(([code]) => code === "en");
    if (defaultLanguage) {
      const [code, name] = defaultLanguage;
      this.setState({ defaultLanguage: { name, code } });
      MetabaseSettings.set("user-locale", code);
    }
  }

  async setDefaultDetails() {
    const token = this.props.location.hash.replace(/^#/, "");
    if (token) {
      const userDetails = await SetupApi.user_defaults({ token });
      this.setState({ defaultDetails: userDetails });
    }
  }

  trackStepSeen() {
    const { activeStep, setupComplete } = this.props;
    const stepNumber = setupComplete ? COMPLETED_STEP_NUMBER : activeStep;

    trackStepSeen(stepNumber);
  }

  renderFooter() {
    return (
      <div className="SetupHelp bordered border-dashed p2 rounded mb4">
        {t`If you feel stuck`},{" "}
        <ExternalLink
          className="link"
          href={MetabaseSettings.docsUrl("setting-up-metabase")}
          target="_blank"
        >{t`our getting started guide`}</ExternalLink>{" "}
        {t`is just a click away.`}
      </div>
    );
  }

  componentDidUpdate(prevProps) {
    const { activeStep, setupComplete } = this.props;

    if (activeStep !== prevProps.activeStep) {
      this.trackStepSeen();
    }

    if (setupComplete && !prevProps.setupComplete) {
      this.trackStepSeen();
      trackStructEvent("Setup", "Complete");
    }
  }

  render() {
    const {
      activeStep,
      setupComplete,
      databaseFormName,
      selectedDatabaseEngine,
      userDetails,
    } = this.props;

    const isDatabaseHelpCardVisible =
      selectedDatabaseEngine && activeStep === DATABASE_CONNECTION_STEP_NUMBER;

    if (activeStep === WELCOME_STEP_NUMBER) {
      return (
        <div className="relative full-height flex flex-full layout-centered">
          <div className="wrapper wrapper--trim text-centered">
            <LogoIcon className="text-brand mb4" height={118} />
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
            <LogoIcon height={51} />
          </nav>

          <div className="wrapper wrapper--small">
            <div className="SetupSteps full">
              <LanguageStep
                {...this.props}
                stepNumber={LANGUAGE_STEP_NUMBER}
                defaultLanguage={this.state.defaultLanguage}
              />
              <UserStep
                {...this.props}
                stepNumber={USER_STEP_NUMBER}
                defaultUserDetails={this.state.defaultDetails?.user}
              />
              <DatabaseConnectionStep
                {...this.props}
                stepNumber={DATABASE_CONNECTION_STEP_NUMBER}
                formName={databaseFormName}
              />

              <PreferencesStep
                {...this.props}
                stepNumber={PREFERENCES_STEP_NUMBER}
              />

              {setupComplete ? (
                <section className="SetupStep bg-white rounded SetupStep--active flex flex-column layout-centered p4">
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
                    {/* We use <a> rather than <Link> because we want a full refresh in case locale changed. */}
                    <a
                      href="/"
                      className="Button Button--primary"
                    >{t`Take me to Metabase`}</a>
                  </div>
                </section>
              ) : null}
              <div className="text-centered">{this.renderFooter()}</div>
            </div>
          </div>

          <AddDatabaseHelpCardHolder isVisible={isDatabaseHelpCardVisible}>
            <AddDatabaseHelpCard
              engine={selectedDatabaseEngine}
              hasCircle={false}
              data-testid="database-setup-help-card"
              style={{
                border: `1px solid ${color("border")}`,
                backgroundColor: color("white"),
              }}
            />
          </AddDatabaseHelpCardHolder>
        </div>
      );
    }
  }
}
