import { useEffect } from "react";

import { getEmbeddingSdkPackageBuildData } from "embedding-sdk-bundle/lib/get-embedding-sdk-package-build-data";
import { isSdkPackageCompatibleWithSdkBundle } from "embedding-sdk-bundle/lib/version-utils";
import { useLazySelector } from "embedding-sdk-bundle/sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/sdk-shared/hooks/use-metabase-provider-props-store";
import { getMetabaseInstanceVersion } from "embedding-sdk-bundle/store/selectors";

export const useLogVersionInfo = () => {
  const {
    state: { props },
  } = useMetabaseProviderPropsStore();

  const sdkPackageVersion = getEmbeddingSdkPackageBuildData()?.version;
  const sdkBundleVersion = useLazySelector(getMetabaseInstanceVersion);

  const allowConsoleLog = props?.allowConsoleLog;

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
