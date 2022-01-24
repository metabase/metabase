import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { Locale, LocaleData } from "../../types";
import { getLocales } from "../../utils";
import {
  LocaleGroup,
  LocaleInput,
  LocaleLabel,
  LocaleText,
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
      <LocaleGroup>
        {locales.map(item => (
          <LocaleLabel key={item.code}>
            <LocaleInput
              type="radio"
              name={fieldId}
              value={item.code}
              checked={item.code === locale?.code}
              onChange={() => onLocaleChange(item)}
            />
            <LocaleText checked={item.code === locale?.code}>
              {item.name}
            </LocaleText>
          </LocaleLabel>
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

export default LanguageStep;
