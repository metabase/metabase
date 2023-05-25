import React, { useEffect } from "react";
import { useSelector } from "metabase/lib/redux";
import { trackStepSeen } from "../../analytics";
import { WELCOME_STEP } from "../../constants";
import { getStep } from "../../selectors";
import { SettingsPage } from "../SettingsPage";
import { WelcomePage } from "../WelcomePage";

export const Setup = (): JSX.Element => {
  const step = useSelector(getStep);

  useEffect(() => {
    trackStepSeen(step);
  }, [step]);

  if (step === WELCOME_STEP) {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};
