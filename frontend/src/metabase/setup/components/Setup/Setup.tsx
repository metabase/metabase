import React from "react";
import { WelcomePage } from "../WelcomePage";
import SettingsPage from "../../containers/SettingsPage";

export interface SetupProps {
  isWelcome: boolean;
}

const Setup = ({ isWelcome, ...props }: SetupProps): JSX.Element => {
  if (isWelcome) {
    return <WelcomePage />;
  } else {
    return <SettingsPage {...props} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Setup;
