import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { Button } from "metabase/core/components/Button";
import { LocaleData } from "metabase-types/api";
import { Locale } from "metabase-types/store";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { getLocales } from "../../utils";
import {
  LocaleGroup,
  LocaleInput,
  LocaleLabel,
  LocaleButton,
  StepDescription,
} from "./LanguageStep.styled";

export interface LanguageStepProps {
  locale?: Locale;
  localeData?: LocaleData[];
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onLocaleChange: (locale: Locale) => void;
  onStepSelect: () => void;
  onStepSubmit: () => void;
}

const LanguageStep = ({
  locale,
  localeData,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onLocaleChange,
  onStepSelect,
  onStepSubmit,
}: LanguageStepProps): JSX.Element => {
  const fieldId = useMemo(() => _.uniqueId(), []);
  const locales = useMemo(() => getLocales(localeData), [localeData]);

  if (!isStepActive) {
    return (
      <InactiveStep
        title={t`Your language is set to ${locale?.name}`}
        label={1}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={onStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={t`What's your preferred language?`} label={1}>
      <StepDescription>
        {t`This language will be used throughout Metabase and will be the default for new users.`}
      </StepDescription>
      <LocaleGroup role="radiogroup">
        {locales.map(item => (
          <LocaleItem
            key={item.code}
            locale={item}
            checked={item.code === locale?.code}
            fieldId={fieldId}
            onLocaleChange={onLocaleChange}
          />
        ))}
      </LocaleGroup>
      <Button
        primary={locale != null}
        disabled={locale == null}
        onClick={onStepSubmit}
      >{t`Next`}</Button>
    </ActiveStep>
  );
};

export interface LocaleItemProps {
  locale: Locale;
  checked: boolean;
  fieldId: string;
  onLocaleChange: (locale: Locale) => void;
}

const LocaleItem = ({
  locale,
  checked,
  fieldId,
  onLocaleChange,
}: LocaleItemProps): JSX.Element => {
  const handleChange = useCallback(() => {
    onLocaleChange(locale);
  }, [locale, onLocaleChange]);

  return (
    <LocaleLabel key={locale.code}>
      <LocaleInput
        type="radio"
        name={fieldId}
        value={locale.code}
        checked={checked}
        autoFocus={checked}
        onChange={handleChange}
      />
      <LocaleButton checked={checked}>{locale.name}</LocaleButton>
    </LocaleLabel>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LanguageStep;
