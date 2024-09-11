import { useEffect, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";

import type { SDKConfig } from "embedding-sdk";
import { getSdkLicenseProblem } from "embedding-sdk/lib/license-problem";
import { printLicenseProblemToConsole } from "embedding-sdk/lib/print-license-problem";
import { setLicenseProblem } from "embedding-sdk/store/reducer";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkLicenseProblem(config: SDKConfig) {
  const { allowConsoleLog = true } = config;

  const hasLoggedRef = useRef(false);
  const appName = useSelector(getApplicationName);

  const dispatch = useDispatch();

  const hasFeatureFlag = useSelector(state => {
    // When the settings endpoint has not been called, we assume that the feature is enabled.
    if (!state.settings.values?.["token-features"]) {
      return true;
    }

    // TODO: replace this with "embedding-sdk" once the token feature PR landed.
    return getTokenFeature(state, "embedding");
  });

  const licenseProblem = useMemo(() => {
    return getSdkLicenseProblem({ hasFeatureFlag, config });
  }, [hasFeatureFlag, config]);

  useEffect(() => {
    // SDK components will stop rendering if a license error is detected.
    dispatch(setLicenseProblem(licenseProblem));

    // Log the problem to the console once.
    if (!hasLoggedRef.current && allowConsoleLog) {
      printLicenseProblemToConsole(licenseProblem, appName);
      hasLoggedRef.current = true;
    }
  }, [licenseProblem, appName, allowConsoleLog, dispatch]);

  return licenseProblem;
}
