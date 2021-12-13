import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { Locale } from "../../types";
import { LanguageList, LanguageItem } from "./LanguageStep.styled";

interface Props {
  locale?: Locale;
  availableLocales: Locale[];
  isActive: boolean;
  isCompleted: boolean;
  onChangeLocale: (locale: Locale) => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const LanguageStep = ({
  locale,
  availableLocales,
  isActive,
  isCompleted,
  onChangeLocale,
  onSelectThisStep,
  onSelectNextStep,
}: Props) => {
  if (!isActive) {
    return (
      <InactiveStep
        title={t`Your language is set to ${locale?.name}`}
        label={1}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
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
        {availableLocales.map(availableLocale => (
          <LanguageItem
            key={availableLocale.code}
            isSelected={availableLocale.code === locale?.code}
            onClick={() => onChangeLocale(availableLocale)}
          >
            {availableLocale.name}
          </LanguageItem>
        ))}
      </LanguageList>
      <Button
        primary={locale != null}
        disabled={locale == null}
        onClick={onSelectNextStep}
      >{t`Next`}</Button>
    </ActiveStep>
  );
};

export default LanguageStep;
