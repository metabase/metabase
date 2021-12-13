import React from "react";
import SettingsPage from "../SettingsPage";
import { WELCOME_STEP } from "../../constants";
import WelcomePage from "../WelcomePage";

interface Props {
  step: number;
}

const Setup = ({ step }: Props) => {
  if (step === WELCOME_STEP) {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};

export default Setup;
