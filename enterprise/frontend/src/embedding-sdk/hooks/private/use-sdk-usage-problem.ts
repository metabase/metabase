import { useEffect, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";

import type { MetabaseAuthConfig } from "embedding-sdk";
import { printUsageProblemToConsole } from "embedding-sdk/lib/print-usage-problem";
import { getSdkUsageProblem } from "embedding-sdk/lib/usage-problem";
import { setUsageProblem } from "embedding-sdk/store/reducer";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkUsageProblem({
  authConfig,
  allowConsoleLog = true,
}: {
  authConfig: MetabaseAuthConfig;
  allowConsoleLog?: boolean;
}) {
  const hasLoggedRef = useRef(false);

  const dispatch = useDispatch();

  // When the setting haven't been loaded or failed to query, we assume that the
  // feature is _enabled_ first. Otherwise, when a user's instance is temporarily down,
  // their customer would see an alarming error message on production.
  // TODO: replace this with "enable-embedding-sdk" once the settings PR landed.
  const isEnabled = useSetting("enable-embedding") ?? true;

  const hasTokenFeature = useSelector(state => {
    // We also assume that the feature is enabled if the token-features are missing.
    // Same reason as above.
    if (!state.settings.values?.["token-features"]) {
      return true;
    }

    return getTokenFeature(state, "embedding_sdk");
  });

  const usageProblem = useMemo(() => {
    return getSdkUsageProblem({
      authConfig,
      hasTokenFeature,
      isEnabled,
    });
  }, [authConfig, hasTokenFeature, isEnabled]);

  useEffect(() => {
    // SDK components will stop rendering if a license error is detected.
    dispatch(setUsageProblem(usageProblem));

    // Log the problem to the console once.
    if (!hasLoggedRef.current && allowConsoleLog) {
      printUsageProblemToConsole(usageProblem);
      hasLoggedRef.current = true;
    }
  }, [usageProblem, allowConsoleLog, dispatch]);

  return usageProblem;
}
