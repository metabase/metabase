import React from "react";
import SettingsPage from "../../containers/SettingsPage";
import WelcomePage from "../../containers/WelcomePage";

export interface SetupProps {
  isWelcome: boolean;
}

const Setup = ({ isWelcome, ...props }: SetupProps): JSX.Element => {
  if (isWelcome) {
    return <WelcomePage {...props} />;
  } else {
    return <SettingsPage {...props} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Setup;
