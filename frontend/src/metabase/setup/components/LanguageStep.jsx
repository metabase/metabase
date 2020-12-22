import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { Box } from "grid-styled";

import MetabaseSettings from "metabase/lib/settings";

import Button from "metabase/components/Button";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

import _ from "underscore";

export default class LanguageStep extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedLanguage: props.defaultLanguage || {
        name: "English",
        code: "en",
      },
    };
  }

  render() {
    const {
      activeStep,
      stepNumber,
      setActiveStep,
      setLanguageDetails,
    } = this.props;
    if (activeStep !== stepNumber) {
      return (
        <CollapsedStep
          stepNumber={stepNumber}
          stepCircleText={String(stepNumber)}
          stepText={t`Your language is set to ${this.state.selectedLanguage.name}`}
          isCompleted={activeStep > stepNumber}
          setActiveStep={setActiveStep}
        />
      );
    } else {
      return (
        <Box
          p={4}
          className="SetupStep SetupStep--active rounded bg-white full relative"
        >
          <StepTitle
            title={t`What's your preferred language?`}
            circleText={String(stepNumber)}
          />
          <p className="text-default">
            {t`This language will be used throughout Metabase and will be the default for new users.`}
          </p>
          <div className="overflow-hidden mb4">
            <ol
              className="scroll-y text-dark text-bold bordered rounded px2 py1"
              style={{ maxHeight: 280 }}
            >
              {_.sortBy(
                MetabaseSettings.get("available-locales") || [
                  ["en", "English"],
                ],
                ([code, name]) => name,
              ).map(([code, name]) => (
                <li
                  key={code}
                  className={cx(
                    "p1 rounded bg-brand-hover text-white-hover cursor-pointer",
                    {
                      "bg-brand text-white":
                        this.state.selectedLanguage.code === code,
                    },
                  )}
                  onClick={() => {
                    this.setState({
                      selectedLanguage: { name: name, code: code },
                    });
                    MetabaseSettings.set("user-locale", code);
                  }}
                >
                  {name}
                </li>
              ))}
            </ol>
          </div>
          <Button
            primary
            onClick={() => {
              return setLanguageDetails({
                nextStep: stepNumber + 1,
                details: { site_locale: this.state.selectedLanguage.code },
              });
            }}
          >{t`Next`}</Button>
        </Box>
      );
    }
  }
}
