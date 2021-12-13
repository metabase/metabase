import React, { useMemo, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/components/Button";
import ActiveStep from "../ActiveStep";
import { LanguageList, LanguageItemRoot } from "./LanguageStep.styled";
import { Locale } from "../../types";
import InactiveStep from "../InvactiveStep/InactiveStep";

interface Props {
  locales: Locale[];
  selectedLocale?: Locale;
  isActive?: boolean;
  isCompleted?: boolean;
  onLocaleChange?: (locale: Locale) => void;
}

const LanguageStep = ({
  locales,
  selectedLocale,
  isActive,
  isCompleted,
  onLocaleChange,
}: Props) => {
  const sortedLocales = useMemo(() => {
    return _.sortBy(locales, l => l.name);
  }, [locales]);

  if (!isActive) {
    return (
      <InactiveStep
        title={t`Your language is set to ${selectedLocale?.name}`}
        label={1}
        isCompleted={isCompleted}
      />
    );
  }

  return (
    <ActiveStep
      title={t`What's your preferred language?`}
      label={1}
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
    </ActiveStep>
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
