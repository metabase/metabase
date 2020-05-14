import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { Box } from "grid-styled";

import MetabaseSettings from "metabase/lib/settings";

import Button from "metabase/components/Button";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

export default class LanguageStep extends React.Component {
  state = { selectedLangage: "en" };
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
          stepCircleText={stepNumber}
          stepText={"Your language is set to English"}
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
            title={"What's your preffered language"}
            circleText={stepNumber}
          />
          <p className="text-default">
            {t`This language will be used throughout Metabase and be the default for
          new users`}
          </p>
          <div style={{ maxHeight: 300 }} className="overflow-hidden">
            <ol className="overflow-scroll">
              {(MetabaseSettings.get("available-locales") || []).map(
                ([value, name]) => (
                  <li
                    className={cx(
                      "p1 rounded bg-brand-hover text-white-hover cursor-pointer",
                      {
                        "bg-brand text-white":
                          this.state.selectedLanguage === value,
                      },
                    )}
                    onClick={() => this.setState({ selectedLanguage: value })}
                  >
                    {name}
                  </li>
                ),
              )}
            </ol>
          </div>
          <Button
            primary
            onClick={() => {
              console.log("clicky clicky");
              return setLanguageDetails({
                nextStep: stepNumber + 1,
                details: "lanugage",
              });
            }}
          >{t`Next`}</Button>
        </Box>
      );
    }
  }
}
