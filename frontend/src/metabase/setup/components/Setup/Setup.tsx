import { useEffect } from "react";
import { useUpdate } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { initSetup } from "metabase/setup/actions";

import { trackStepSeen } from "../../analytics";
import { getIsLocaleLoaded, getStep, getSteps } from "../../selectors";
import { SettingsPage } from "../SettingsPage";
import { WelcomePage } from "../WelcomePage";

export const Setup = (): JSX.Element => {
  const step = useSelector(getStep);
  const stepIndex = useSelector(getSteps).findIndex(({ key }) => key === step);
  const dispatch = useDispatch();

  const isLocaleLoaded = useSelector(getIsLocaleLoaded);
  const update = useUpdate();

  useEffect(() => {
    dispatch(initSetup());
  });

  useEffect(() => {
    trackStepSeen({ stepName: step, stepNumber: stepIndex });
  }, [step, stepIndex]);

  useEffect(() => {
    if (isLocaleLoaded) {
      update();
    }
  }, [update, isLocaleLoaded]);

  if (step === "welcome") {
    return <WelcomePage />;
  } else {
    return <SettingsPage />;
  }
};
