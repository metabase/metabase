import React from "react";
import SettingsPage from "../SettingsPage";
import WelcomePage from "../WelcomePage";
import { WELCOME_STEP } from "../../constants";
import { Locale, UserInfo } from "../../types";

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

const Setup = (props: Props) => {
  if (props.step === WELCOME_STEP) {
    return <WelcomePage {...props} />;
  } else {
    return <SettingsPage {...props} />;
  }
};

export default Setup;
