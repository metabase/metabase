import React from "react";
import SettingsPage from "../../containers/SettingsPage";
import WelcomePage from "../../containers/WelcomePage";

interface Props {
  isWelcome: boolean;
}

const Setup = ({ isWelcome }: Props) => {
  if (isWelcome) {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};

export default Setup;
