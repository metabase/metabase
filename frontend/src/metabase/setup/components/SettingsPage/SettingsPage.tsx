import React from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { PageHeader, PageBody } from "./SettingsPage.styled";
import LanguageStep from "../../containers/LanguageStep";
import UserStep from "../../containers/UserStep";
import DatabaseStep from "../../containers/DatabaseStep";
import DatabaseHelp from "../../containers/DatabaseHelp";
import PreferencesStep from "../../containers/PreferencesStep";
import CompletedStep from "../CompletedStep";
import SetupHelp from "../SetupHelp";
import { COMPLETED_STEP } from "../../constants";
import { Locale, UserInfo, LocaleData, DatabaseInfo } from "../../types";

interface Props {
  step: number;
  locale?: Locale;
  localeData?: LocaleData[];
  user?: UserInfo;
  database?: DatabaseInfo;
  databaseEngine?: string;
  isTrackingAllowed: boolean;
  isHosted: boolean;
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
  isHosted,
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
      <LanguageStep />
      <UserStep />
      <DatabaseStep />
      <PreferencesStep />
      <CompletedStep user={user} isActive={step === COMPLETED_STEP} />
      <SetupHelp />
      <DatabaseHelp />
    </PageBody>
  </div>
);

export default SettingsPage;
