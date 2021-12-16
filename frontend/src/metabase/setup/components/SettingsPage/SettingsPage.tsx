import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../components/LanguageStep";
import UserStep from "../../components/UserStep";
import DatabaseStep from "../DatabaseStep";
import PreferencesStep from "../PreferencesStep";
import CompletedStep from "../CompletedStep";
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
  localeData?: LocaleData[];
  user?: UserInfo;
  database?: DatabaseInfo;
  isTrackingAllowed: boolean;
  onChangeStep: (step: number) => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeUser: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => Promise<void>;
  onChangeDatabase: (database: DatabaseInfo | null) => void;
  onChangeTracking: (isTrackingAllowed: boolean) => void;
}

const SettingsPage = ({
  step,
  locale,
  localeData,
  user,
  database,
  isTrackingAllowed,
  onChangeStep,
  onChangeLocale,
  onChangeUser,
  onValidatePassword,
  onChangeDatabase,
  onChangeTracking,
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
        isTrackingAllowed={isTrackingAllowed}
        isActive={step === PREFERENCES_STEP}
        isCompleted={step > PREFERENCES_STEP}
        onChangeTracking={onChangeTracking}
        onSelectThisStep={() => onChangeStep(PREFERENCES_STEP)}
        onSelectNextStep={() => onChangeStep(COMPLETED_STEP)}
      />
      <CompletedStep user={user} isActive={step === COMPLETED_STEP} />
      <SetupFooter />
    </PageBody>
  </div>
);

export default SettingsPage;
