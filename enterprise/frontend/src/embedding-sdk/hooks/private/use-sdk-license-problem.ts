import { useEffect, useMemo, useRef } from "react";

import type { SDKConfig } from "embedding-sdk";
import { getSdkLicenseProblem } from "embedding-sdk/lib/license-problem";
import { printLicenseProblemToConsole } from "embedding-sdk/lib/print-license-problem";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkLicenseProblem(config: SDKConfig) {
  const hasLoggedRef = useRef(false);
  const appName = useSelector(getApplicationName);

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

  // Log the problem to the console once.
  useEffect(() => {
    if (!hasLoggedRef.current) {
      printLicenseProblemToConsole(licenseProblem, appName);
      hasLoggedRef.current = true;
    }
  }, [licenseProblem, appName]);

  return licenseProblem;
}
