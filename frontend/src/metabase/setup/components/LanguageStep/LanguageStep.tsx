import React, { useMemo } from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { Locale, LocaleData } from "../../types";
import { getLocales } from "../../utils";
import {
  StepLocaleList,
  StepLocaleListItem,
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
      <StepLocaleList>
        {locales.map(item => (
          <StepLocaleListItem
            key={item.code}
            isSelected={item.code === locale?.code}
            data-testid={`language-option-${item.code}`}
            onClick={() => onLocaleChange(item)}
          >
            {item.name}
          </StepLocaleListItem>
        ))}
      </StepLocaleList>
      <Button
        primary={locale != null}
        disabled={locale == null}
        onClick={onStepSubmit}
      >{t`Next`}</Button>
    </ActiveStep>
  );
};

export default LanguageStep;
