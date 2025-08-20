import { useMemo } from "react";
import { c, t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper";
import { getEmbeddingSdkPackageBuildData } from "embedding-sdk/lib/get-embedding-sdk-package-build-data";
import {
  isInvalidMetabaseVersion,
  isSdkPackageCompatibleWithSdkBundle,
} from "embedding-sdk/lib/version-utils";
import { useSdkSelector } from "embedding-sdk/store";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";
import { Anchor } from "metabase/ui";

export function SdkIncompatibilityWithInstanceBanner() {
  const sdkPackageVersion = getEmbeddingSdkPackageBuildData().version;
  const sdkBundleVersion = useSdkSelector(getMetabaseInstanceVersion);

  const isSdkCompatibleWithInstance = useMemo(() => {
    if (!sdkBundleVersion || !sdkPackageVersion) {
      // If we don't have the Metabase version, we can't determine compatibility.
      return true;
    }

    if (isInvalidMetabaseVersion(sdkBundleVersion)) {
      return true;
    }

    return isSdkPackageCompatibleWithSdkBundle({
      sdkPackageVersion,
      sdkBundleVersion,
    });
  }, [sdkPackageVersion, sdkBundleVersion]);

  if (isSdkCompatibleWithInstance) {
    return null;
  }

  const handlePageReload = () => {
    window.location.reload();
  };

  return (
    <SdkError
      type="fixed"
      withCloseButton
      message={
        <span>{c("{0} is the button to reload the page")
          .jt`The analytics server is undergoing maintenance. ${(
          <Anchor
            key="reload-page-button"
            data-testid="reload-page-button"
            onClick={handlePageReload}
          >{t`Reload the page`}</Anchor>
        )}.`}</span>
      }
    />
  );
}
