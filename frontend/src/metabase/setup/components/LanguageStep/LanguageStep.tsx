import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { useDispatch, useSelector } from "metabase/lib/redux";
import Button from "metabase/core/components/Button";
import { Locale } from "metabase-types/store";
import { selectStep, updateLocale } from "../../actions";
import { LANGUAGE_STEP, USER_STEP } from "../../constants";
import {
  getAvailableLocales,
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
  getLocale,
} from "../../selectors";
import { getLocales } from "../../utils";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InvactiveStep";
import {
  LocaleGroup,
  LocaleInput,
  LocaleLabel,
  LocaleButton,
  StepDescription,
} from "./LanguageStep.styled";

export const LanguageStep = (): JSX.Element => {
  const locale = useSelector(getLocale);
  const localeData = useSelector(getAvailableLocales);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, LANGUAGE_STEP),
  );
  const isStepCompleted = useSelector(state =>
    getIsStepCompleted(state, LANGUAGE_STEP),
  );
  const isSetupCompleted = useSelector(state => getIsSetupCompleted(state));
  const fieldId = useMemo(() => _.uniqueId(), []);
  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const dispatch = useDispatch();

  const handleLocaleChange = (locale: Locale) => {
    dispatch(updateLocale(locale));
  };

  const handleStepSelect = () => {
    dispatch(selectStep(LANGUAGE_STEP));
  };

  const handleStepSubmit = () => {
    dispatch(selectStep(USER_STEP));
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={t`Your language is set to ${locale?.name}`}
        label={1}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={handleStepSelect}
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
