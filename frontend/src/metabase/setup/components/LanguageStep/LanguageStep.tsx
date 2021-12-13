import React from "react";
import { t } from "ttag";
import SetupStep from "../SetupStep";

const LanguageStep = () => {
  return <SetupStep title={t`What's your preferred language?`} label={t`1`} />;
};

export default LanguageStep;
