import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/components/Button";
import SetupStep from "../SetupStep";
import { LanguageList, LanguageItemRoot } from "./LanguageStep.styled";
import { Locale } from "../../types";

interface Props {
  locales: Locale[];
  selectedLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}

const LanguageStep = ({ locales, selectedLocale, onLocaleChange }: Props) => {
  const sortedLocales = useMemo(() => {
    return _.sortBy(locales, l => l.name);
  }, [locales]);

  return (
    <SetupStep
      title={t`What's your preferred language?`}
      label={t`1`}
      description={t`This language will be used throughout Metabase and will be the default for new users.`}
    >
      <LanguageList>
        {sortedLocales.map(locale => (
          <LanguageItem
            key={locale.code}
            locale={locale}
            isSelected={locale.code === selectedLocale?.code}
            onLocaleChange={onLocaleChange}
          />
        ))}
      </LanguageList>
      <Button primary>{t`Next`}</Button>
    </SetupStep>
  );
};

interface LanguageItemProps {
  locale: Locale;
  isSelected?: boolean;
  onLocaleChange?: (locale: Locale) => void;
}

const LanguageItem = ({
  locale,
  isSelected,
  onLocaleChange,
}: LanguageItemProps) => {
  const handleClick = useCallback(() => {
    onLocaleChange && onLocaleChange(locale);
  }, [locale, onLocaleChange]);

  return (
    <LanguageItemRoot
      key={locale.code}
      isSelected={isSelected}
      onClick={handleClick}
    >
      {locale.name}
    </LanguageItemRoot>
  );
};

export default LanguageStep;
