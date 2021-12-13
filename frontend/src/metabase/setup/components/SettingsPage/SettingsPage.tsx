import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../components/LanguageStep";
import UserStep from "../../components/UserStep";
import SetupFooter from "../SetupFooter";
import { Locale, UserInfo } from "../../types";
import { LANGUAGE_STEP, USER_STEP, DATABASE_STEP } from "../../constants";

interface Props {
  step: number;
  locale?: Locale;
  availableLocales: Locale[];
  user?: UserInfo;
  onChangeStep: (step: number) => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeUser: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
}

const SettingsPage = ({
  step,
  locale,
  availableLocales,
  user,
  onChangeStep,
  onChangeLocale,
  onChangeUser,
  onValidatePassword,
}: Props) => (
  <div>
    <PageHeader>
      <LogoIcon height={51} />
    </PageHeader>
    <PageBody>
      <LanguageStep
        locale={locale}
        availableLocales={availableLocales}
        isActive={step === LANGUAGE_STEP}
        isCompleted={step > LANGUAGE_STEP}
        onChangeLocale={onChangeLocale}
        onSelectThisStep={() => onChangeStep(LANGUAGE_STEP)}
        onSelectNextStep={() => onChangeStep(USER_STEP)}
      />
      <UserStep
        user={user}
        isActive={step === USER_STEP}
        isCompleted={step > USER_STEP}
        onChangeUser={onChangeUser}
        onValidatePassword={onValidatePassword}
        onSelectThisStep={() => onChangeStep(USER_STEP)}
        onSelectNextStep={() => onChangeStep(DATABASE_STEP)}
      />
      <SetupFooter />
    </PageBody>
  </div>
);

export default SettingsPage;
