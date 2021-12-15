import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../components/LanguageStep";
import UserStep from "../../components/UserStep";
import DatabaseStep from "../DatabaseStep";
import PreferencesStep from "../PreferencesStep";
import SetupFooter from "../SetupFooter";
import {
  LANGUAGE_STEP,
  USER_STEP,
  DATABASE_STEP,
  PREFERENCES_STEP,
  COMPLETED_STEP,
} from "../../constants";
import { Locale, UserInfo, LocaleData, DatabaseInfo } from "../../types";

interface Props {
  step: number;
  locale?: Locale;
  localeData: LocaleData[];
  user?: UserInfo;
  database?: DatabaseInfo;
  onChangeStep: (step: number) => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeUser: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
  onChangeDatabase: (database?: DatabaseInfo) => void;
}

const SettingsPage = ({
  step,
  locale,
  localeData,
  user,
  database,
  onChangeStep,
  onChangeLocale,
  onChangeUser,
  onValidatePassword,
  onChangeDatabase,
}: Props) => (
  <div>
    <PageHeader>
      <LogoIcon height={51} />
    </PageHeader>
    <PageBody>
      <LanguageStep
        locale={locale}
        localeData={localeData}
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
      <DatabaseStep
        database={database}
        isActive={step === DATABASE_STEP}
        isCompleted={step > DATABASE_STEP}
        onChangeDatabase={onChangeDatabase}
        onSelectThisStep={() => onChangeStep(DATABASE_STEP)}
        onSelectNextStep={() => onChangeStep(PREFERENCES_STEP)}
      />
      <PreferencesStep
        isTrackingAllowed={false}
        isActive={step === PREFERENCES_STEP}
        isCompleted={step > PREFERENCES_STEP}
        onSelectThisStep={() => onChangeStep(PREFERENCES_STEP)}
        onSelectNextStep={() => onChangeStep(COMPLETED_STEP)}
      />
      <SetupFooter />
    </PageBody>
  </div>
);

export default SettingsPage;
