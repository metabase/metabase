import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/components/Button";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { Locale } from "../../types";
import { LanguageList, LanguageItem } from "./LanguageStep.styled";
import { USER_STEP, LANGUAGE_STEP } from "../../constants";

interface Props {
  locales: Locale[];
  selectedLocale?: Locale;
  isActive?: boolean;
  isCompleted?: boolean;
  onLocaleChange?: (locale: Locale) => void;
  onStepChange?: (step: number) => void;
}

const LanguageStep = ({
  locales,
  selectedLocale,
  isActive,
  isCompleted,
  onLocaleChange,
  onStepChange,
}: Props) => {
  const sortedLocales = useMemo(() => {
    return _.sortBy(locales, l => l.name);
  }, [locales]);

  if (!isActive) {
    return (
      <InactiveStep
        step={LANGUAGE_STEP}
        title={t`Your language is set to ${selectedLocale?.name}`}
        isCompleted={isCompleted}
      />
    );
  }

  return (
    <ActiveStep
      step={LANGUAGE_STEP}
      title={t`What's your preferred language?`}
      description={t`This language will be used throughout Metabase and will be the default for new users.`}
    >
      <LanguageList>
        {sortedLocales.map(locale => (
          <LanguageItem
            key={locale.code}
            isSelected={locale.code === selectedLocale?.code}
            onClick={() => onLocaleChange?.(locale)}
          >
            {locale.name}
          </LanguageItem>
        ))}
      </LanguageList>
      <Button
        primary
        onClick={() => onStepChange?.(USER_STEP)}
      >{t`Next`}</Button>
    </ActiveStep>
  );
};

export default LanguageStep;
