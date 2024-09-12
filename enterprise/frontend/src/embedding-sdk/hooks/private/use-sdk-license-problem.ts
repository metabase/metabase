import { useEffect, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";

import type { SDKConfig } from "embedding-sdk";
import { getSdkUsageProblem } from "embedding-sdk/lib/license-problem";
import { printUsageProblemToConsole } from "embedding-sdk/lib/print-license-problem";
import { setUsageProblem } from "embedding-sdk/store/reducer";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkUsageProblem(config: SDKConfig) {
  const { allowConsoleLog = true } = config;

  const hasLoggedRef = useRef(false);
  const appName = useSelector(getApplicationName);

  const dispatch = useDispatch();

  // When the setting haven't been loaded or failed to query, we assume that the
  // feature is _enabled_ first. Otherwise, when a user's instance is temporarily down,
  // their customer would see an alarming error message on production.
  // TODO: replace this with "enable-embedding-sdk" once the feature flag PR landed.
  const isEnabled = useSetting("enable-embedding") ?? true;

  const hasTokenFeature = useSelector(state => {
    // We also assume that the feature is enabled if the token-features are missing.
    // Same reason as above.
    if (!state.settings.values?.["token-features"]) {
      return true;
    }

    // TODO: replace this with "embedding-sdk" once the token feature PR landed.
    return getTokenFeature(state, "embedding");
  });

  const usageProblem = useMemo(() => {
    return getSdkUsageProblem({ hasTokenFeature, isEnabled, config });
  }, [config, hasTokenFeature, isEnabled]);

  useEffect(() => {
    // SDK components will stop rendering if a license error is detected.
    dispatch(setUsageProblem(usageProblem));

    // Log the problem to the console once.
    if (!hasLoggedRef.current && allowConsoleLog) {
      printUsageProblemToConsole(usageProblem, appName);
      hasLoggedRef.current = true;
    }
  }, [usageProblem, appName, allowConsoleLog, dispatch]);

  return usageProblem;
}
