import React from "react";
import SettingsPage from "../../containers/SettingsPage";
import WelcomePage from "../../containers/WelcomePage";

export interface SetupProps {
  isWelcome: boolean;
}

const Setup = ({ isWelcome }: SetupProps) => {
  if (isWelcome) {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};

export default Setup;
