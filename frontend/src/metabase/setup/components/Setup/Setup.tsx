import React from "react";
import SettingsPage from "../SettingsPage";
import WelcomePage from "../WelcomePage";
import { WELCOME_STEP } from "../../constants";
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

const Setup = (props: Props) => {
  if (props.step === WELCOME_STEP) {
    return <WelcomePage {...props} />;
  } else {
    return <SettingsPage {...props} />;
  }
};

export default Setup;
