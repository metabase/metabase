import { useMemo } from "react";
import { c, t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getMetabaseInstanceVersion } from "embedding-sdk-bundle/store/selectors";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import {
  isInvalidMetabaseVersion,
  isSdkBundleCompatibleWithMetabaseInstance,
} from "embedding-sdk-shared/lib/version-utils";
import { Anchor } from "metabase/ui";

export function SdkIncompatibilityWithInstanceBanner() {
  const sdkBundleVersion = getBuildInfo(
    "METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO",
  )?.version;
  const metabaseInstanceVersion = useSdkSelector(getMetabaseInstanceVersion);

  const isSdkCompatibleWithInstance = useMemo(() => {
    if (!sdkBundleVersion || !metabaseInstanceVersion) {
      // If we don't have the Metabase version, we can't determine compatibility.
      return true;
    }

    if (isInvalidMetabaseVersion(metabaseInstanceVersion)) {
      return true;
    }

    return isSdkBundleCompatibleWithMetabaseInstance({
      sdkBundleVersion,
      metabaseInstanceVersion,
    });
  }, [sdkBundleVersion, metabaseInstanceVersion]);

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
