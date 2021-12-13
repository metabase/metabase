import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import SetupStep from "../SetupStep";
import { StepDescription } from "./LanguageStep.styled";

const LanguageStep = () => {
  return (
    <SetupStep title={t`What's your preferred language?`} label={t`1`}>
      <StepDescription>{t`This language will be used throughout Metabase and will be the default for new users.`}</StepDescription>
      <Button primary>{t`Next`}</Button>
    </SetupStep>
  );
};

export default LanguageStep;
