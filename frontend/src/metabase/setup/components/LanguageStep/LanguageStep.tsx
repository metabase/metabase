import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Locale } from "metabase-types/store";

import { useStep } from "../..//useStep";
import { goToNextStep, updateLocale } from "../../actions";
import { getAvailableLocales, getLocale } from "../../selectors";
import { getLocales } from "../../utils";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

import {
  LocaleButton,
  LocaleGroup,
  LocaleInput,
  LocaleLabel,
  StepDescription,
} from "./LanguageStep.styled";

export const LanguageStep = ({ stepLabel }: NumberedStepProps): JSX.Element => {
  const { isStepActive, isStepCompleted } = useStep("language");
  const locale = useSelector(getLocale);
  const localeData = useSelector(getAvailableLocales);
  const fieldId = useMemo(() => _.uniqueId(), []);
  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const dispatch = useDispatch();

  const handleLocaleChange = (locale: Locale) => {
    dispatch(updateLocale(locale));
  };

  const handleStepSubmit = () => {
    dispatch(goToNextStep());
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={t`Your language is set to ${locale?.name}`}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
      />
    );
  }

  return (
    <ActiveStep title={t`What's your preferred language?`} label={stepLabel}>
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
            onLocaleChange={handleLocaleChange}
          />
        ))}
      </LocaleGroup>
      <Button
        primary={locale != null}
        disabled={locale == null}
        onClick={handleStepSubmit}
      >
        {t`Next`}
      </Button>
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
