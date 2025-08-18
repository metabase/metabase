import { useEffect } from "react";

import { getSdkBundleVersion } from "embedding-sdk/sdk-package/store/selectors";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { getEmbeddingSdkPackageBuildData } from "embedding-sdk/sdk-shared/lib/get-embedding-sdk-package-build-data";
import { isSdkPackageCompatibleWithSdkBundle } from "embedding-sdk/sdk-shared/lib/is-sdk-package-compatible-with-sdk-bundle";

type Options = {
  allowConsoleLog?: boolean;
};

export const useLogVersionInfo = ({ allowConsoleLog = true }: Options) => {
  const sdkPackageVersion = getEmbeddingSdkPackageBuildData()?.version;
  const sdkBundleVersion = useLazySelector(getSdkBundleVersion);

  useEffect(() => {
    if (!sdkPackageVersion || !sdkBundleVersion) {
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
        // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
        "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
      );
    }

    if (allowConsoleLog) {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
        `Using Metabase Embedding SDK package version ${sdkPackageVersion}, Metabase Embedding SDK bundle version ${sdkBundleVersion}`,
      );
    }
  }, [allowConsoleLog, sdkPackageVersion, sdkBundleVersion]);
};
