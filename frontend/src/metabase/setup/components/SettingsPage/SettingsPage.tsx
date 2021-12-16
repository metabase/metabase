import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../components/LanguageStep";
import UserStep from "../../components/UserStep";
import DatabaseStep from "../DatabaseStep";
import PreferencesStep from "../PreferencesStep";
import CompletedStep from "../CompletedStep";
import SetupHelp from "../SetupHelp";
import {
  LANGUAGE_STEP,
  USER_STEP,
  DATABASE_STEP,
  PREFERENCES_STEP,
  COMPLETED_STEP,
} from "../../constants";
import { Locale, UserInfo, LocaleData, DatabaseInfo } from "../../types";
import DatabaseHelp from "../DatabaseHelp";

interface Props {
  step: number;
  locale?: Locale;
  localeData?: LocaleData[];
  user?: UserInfo;
  database?: DatabaseInfo;
  databaseEngine?: string;
  isTrackingAllowed: boolean;
  onChangeStep: (step: number) => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeUser: (user: UserInfo) => void;
  onChangeDatabase: (database: DatabaseInfo | null) => void;
  onChangeTracking: (isTrackingAllowed: boolean) => void;
  onValidatePassword: (user: UserInfo) => void;
  onValidateDatabase: (database: DatabaseInfo) => void;
  onSubmitSetup: () => void;
}

const SettingsPage = ({
  step,
  locale,
  localeData,
  user,
  database,
  databaseEngine,
  isTrackingAllowed,
  onChangeStep,
  onChangeLocale,
  onChangeUser,
  onChangeDatabase,
  onValidatePassword,
  onChangeTracking,
  onValidateDatabase,
  onSubmitSetup,
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
        isFilled={step > LANGUAGE_STEP}
        isCompleted={step === COMPLETED_STEP}
        onChangeLocale={onChangeLocale}
        onSelectThisStep={() => onChangeStep(LANGUAGE_STEP)}
        onSelectNextStep={() => onChangeStep(USER_STEP)}
      />
      <UserStep
        user={user}
        isActive={step === USER_STEP}
        isFilled={step > USER_STEP}
        isCompleted={step === COMPLETED_STEP}
        onChangeUser={onChangeUser}
        onValidatePassword={onValidatePassword}
        onSelectThisStep={() => onChangeStep(USER_STEP)}
        onSelectNextStep={() => onChangeStep(DATABASE_STEP)}
      />
      <DatabaseStep
        database={database}
        isActive={step === DATABASE_STEP}
        isFilled={step > DATABASE_STEP}
        isCompleted={step === COMPLETED_STEP}
        onChangeDatabase={onChangeDatabase}
        onValidateDatabase={onValidateDatabase}
        onSelectThisStep={() => onChangeStep(DATABASE_STEP)}
        onSelectNextStep={() => onChangeStep(PREFERENCES_STEP)}
      />
      <PreferencesStep
        isTrackingAllowed={isTrackingAllowed}
        isActive={step === PREFERENCES_STEP}
        isFilled={step > PREFERENCES_STEP}
        isCompleted={step === COMPLETED_STEP}
        onChangeTracking={onChangeTracking}
        onSubmitSetup={onSubmitSetup}
        onSelectThisStep={() => onChangeStep(PREFERENCES_STEP)}
        onSelectNextStep={() => onChangeStep(COMPLETED_STEP)}
      />
      <CompletedStep user={user} isActive={step === COMPLETED_STEP} />
      <SetupHelp />
      <DatabaseHelp engine={databaseEngine} isActive={step === DATABASE_STEP} />
    </PageBody>
  </div>
);

export default SettingsPage;
