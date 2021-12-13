import React from "react";
import SettingsPage from "../SettingsPage";
import WelcomePage from "../WelcomePage";

interface Props {
  isWelcome?: boolean;
}

const Setup = ({ isWelcome }: Props) => {
  if (isWelcome) {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};

export default Setup;
