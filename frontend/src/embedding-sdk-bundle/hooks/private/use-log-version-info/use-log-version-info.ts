import { useEffect } from "react";

import { getIsLocalhost } from "embedding-sdk-bundle/lib/get-is-localhost";
import { getHostReactMajorVersion } from "embedding-sdk-bundle/lib/host-react-version";
import { printUsageProblemToConsole } from "embedding-sdk-bundle/lib/print-usage-problem";
import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { toWarning } from "embedding-sdk-bundle/lib/usage-problem";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { isHostAppInDevMode } from "embedding-sdk-shared/lib/is-host-app-in-dev-mode";
import {
  isInvalidMetabaseVersion,
  isSdkPackageCompatibleWithSdkBundle,
} from "embedding-sdk-shared/lib/version-utils";

export const useLogVersionInfo = () => {
  const {
    state: { props },
  } = useMetabaseProviderPropsStore();

  const sdkPackageVersion = getBuildInfo(
    "METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO",
  )?.version;
  const sdkBundleVersion = getBuildInfo(
    "METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO",
  )?.version;

  const allowConsoleLog = props?.allowConsoleLog;

  useEffect(() => {
    if (!sdkPackageVersion || !sdkBundleVersion) {
      return;
    }

    if (isInvalidMetabaseVersion(sdkBundleVersion)) {
      return;
    }

    if (
      !isSdkPackageCompatibleWithSdkBundle({
        sdkPackageVersion,
        sdkBundleVersion,
      })
    ) {
      console.warn(
        `SDK package version ${sdkPackageVersion} is not compatible with SDK bundle version ${sdkBundleVersion}, this might cause issues.`,
        // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This links only shows for admins.
        "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
      );
    }

    if (allowConsoleLog) {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Not a user facing string
        `Using Metabase modular embedding SDK package version ${sdkPackageVersion}, Metabase Embedding SDK bundle version ${sdkBundleVersion}`,
      );
    }
  }, [allowConsoleLog, sdkPackageVersion, sdkBundleVersion]);

  useEffect(() => {
    // Development hosts already get this warning from the usage problem banner.
    const isProductionHost = !getIsLocalhost() && !isHostAppInDevMode();

    if (getHostReactMajorVersion() === 18 && isProductionHost) {
      printUsageProblemToConsole(toWarning("REACT_18_DEPRECATED"));
    }
  }, []);
};
