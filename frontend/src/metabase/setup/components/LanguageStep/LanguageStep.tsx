import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/components/Button";
import SetupStep from "../SetupStep";
import { LocaleList, LocaleItem } from "./LanguageStep.styled";
import { Locale } from "../../types";

interface Props {
  locales: Locale[];
}

const LanguageStep = ({ locales }: Props) => {
  const items = useMemo(() => _.sortBy(locales, l => l.name), [locales]);

  return (
    <SetupStep
      title={t`What's your preferred language?`}
      label={t`1`}
      description={t`This language will be used throughout Metabase and will be the default for new users.`}
    >
      <LocaleList>
        {items.map(item => (
          <LocaleItem key={item.code}>{item.name}</LocaleItem>
        ))}
      </LocaleList>
      <Button primary>{t`Next`}</Button>
    </SetupStep>
  );
};

export default LanguageStep;
