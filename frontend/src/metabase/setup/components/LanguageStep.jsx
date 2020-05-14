import React from "react";
import { t } from "ttag";
import { Box } from "grid-styled";

import Button from "metabase/components/Button";

import StepTitle from "./StepTitle";
import CollapsedStep from "./CollapsedStep";

export default function LanguageStep({
  activeStep,
  stepNumber,
  setActiveStep,
  setLanguageDetails,
}) {
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
        <p className="text-normal">
          {t`This language will be used throughout Metabase and be the default for
          new users`}
        </p>
        <p>LANGUAGE_LIST_GOES_HERE</p>
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
