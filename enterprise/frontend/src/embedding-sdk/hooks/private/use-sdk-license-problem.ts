import { useEffect, useMemo } from "react";

import type { SDKConfig } from "embedding-sdk";
import { getSdkLicenseProblem } from "embedding-sdk/lib/user-warnings/license-problem";
import { useSelector } from "metabase/lib/redux";
import { getTokenFeature } from "metabase/setup/selectors";

export function useSdkLicenseProblem(config: SDKConfig) {
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

  const { severity, message } = licenseProblem ?? {};

  // Log the problem to the console.
  useEffect(() => {
    if (severity === "error") {
      // eslint-disable-next-line no-console
      console.error(message);
    } else if (severity === "warning") {
      // eslint-disable-next-line no-console
      console.warn(message);
    }
  }, [severity, message]);

  return licenseProblem;
}
