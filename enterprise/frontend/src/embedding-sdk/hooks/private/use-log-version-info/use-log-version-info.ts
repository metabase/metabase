import { useEffect } from "react";

import { getEmbeddingSdkPackageVersion } from "embedding-sdk/lib/get-embedding-sdk-package-version";
import { isSdkPackageCompatibleWithSdkBundle } from "embedding-sdk/lib/version-utils";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";

type Options = {
  allowConsoleLog?: boolean;
};

export const useLogVersionInfo = ({ allowConsoleLog = true }: Options) => {
  const sdkPackageVersion = getEmbeddingSdkPackageVersion();
  const sdkBundleVersion = useLazySelector(getMetabaseInstanceVersion);

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
