import cx from "classnames";
import { useCallback, useMemo, useState, type JSX } from "react";
import { t } from "ttag";
import _ from "underscore";

import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/redux";
import type { Locale } from "metabase/redux/store";
import { useSetting } from "metabase/settings";
import { Box, Button, Stack } from "metabase/ui";

import { useStep } from "../..//useStep";
import { goToNextStep, updateLocale } from "../../actions";
import { getLocale } from "../../selectors";
import { getLocales } from "../../utils";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

import S from "./LanguageStep.module.css";

export const LanguageStep = ({ stepLabel }: NumberedStepProps): JSX.Element => {
  const { isStepActive, isStepCompleted } = useStep("language");
  const locale = useSelector(getLocale);
  const localeData = useSetting("available-locales");
  const fieldId = useMemo(() => _.uniqueId(), []);
  const locales = useMemo(() => getLocales(localeData), [localeData]);
  const dispatch = useDispatch();

  const [selectedLocale, setSelectedLocale] = useState<Locale | undefined>(
    locale,
  );

  const handleLocaleChange = (locale: Locale) => {
    setSelectedLocale(locale);
  };

  const handleStepSubmit = () => {
    if (selectedLocale) {
      dispatch(updateLocale(selectedLocale));
    }
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
      <Stack c="text-secondary" my="md" gap="lg">
        {t`This language will be used throughout Metabase and will be the default for new users.`}
        <CommunityLocalizationNotice isAdminView />
      </Stack>
      <Box
        component="ol"
        className={CS.overflowYScroll}
        role="radiogroup"
        mb="xxl"
        p="sm"
        mah="17.5rem"
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="xxs"
      >
        {locales.map((item) => (
          <LocaleItem
            key={item.code}
            locale={item}
            checked={item.code === selectedLocale?.code}
            fieldId={fieldId}
            onLocaleChange={handleLocaleChange}
          />
        ))}
      </Box>
      <Button
        variant={selectedLocale != null ? "filled" : "default"}
        disabled={selectedLocale == null}
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
    <Box component="label" display="block">
      <input
        className={S.localeInput}
        type="radio"
        name={fieldId}
        value={locale.code}
        checked={checked}
        autoFocus={checked}
        onChange={handleChange}
      />
      <Box
        component="span"
        className={cx(S.localeButton, { [S.localeButtonChecked]: checked })}
        display="block"
        p="sm"
        bdrs="xxs"
        fw={700}
      >
        {locale.name}
      </Box>
    </Box>
  );
};
