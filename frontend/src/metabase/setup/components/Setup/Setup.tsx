import { useEffect } from "react";
import { useUpdate } from "react-use";
import { useSelector } from "metabase/lib/redux";
import { trackStepSeen } from "../../analytics";
import { getIsLocaleLoaded, getStep } from "../../selectors";
import { SettingsPage } from "../SettingsPage";
import { WelcomePage } from "../WelcomePage";

export const Setup = (): JSX.Element => {
  const step = useSelector(getStep);
  const isLocaleLoaded = useSelector(getIsLocaleLoaded);
  const update = useUpdate();

  useEffect(() => {
    trackStepSeen(step);
  }, [step]);

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
