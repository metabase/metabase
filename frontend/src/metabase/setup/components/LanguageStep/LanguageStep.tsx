import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import SetupStep from "../SetupStep";
import { LocaleList, LocaleItem } from "./LanguageStep.styled";

const LanguageStep = () => {
  return (
    <SetupStep
      title={t`What's your preferred language?`}
      label={t`1`}
      description={t`This language will be used throughout Metabase and will be the default for new users.`}
    >
      <LocaleList>
        <LocaleItem>Czech</LocaleItem>
        <LocaleItem>English</LocaleItem>
      </LocaleList>
      <Button primary>{t`Next`}</Button>
    </SetupStep>
  );
};

export default LanguageStep;
