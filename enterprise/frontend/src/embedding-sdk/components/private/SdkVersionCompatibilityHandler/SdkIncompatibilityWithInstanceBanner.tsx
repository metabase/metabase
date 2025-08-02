import { useMemo } from "react";
import { jt, t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import {
  isInvalidMetabaseVersion,
  isSdkVersionCompatibleWithMetabaseVersion,
} from "embedding-sdk/lib/version-utils";
import { useSdkSelector } from "embedding-sdk/store";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";
import { Anchor } from "metabase/ui";

export function SdkIncompatibilityWithInstanceBanner() {
  const mbVersion = useSdkSelector(getMetabaseInstanceVersion);
  const sdkVersion = getEmbeddingSdkVersion();

  const isSdkCompatibleWithInstance = useMemo(() => {
    if (!mbVersion || sdkVersion === "unknown") {
      // If we don't have the Metabase version, we can't determine compatibility.
      return true;
    }

    if (isInvalidMetabaseVersion(mbVersion)) {
      return true;
    }

    return isSdkVersionCompatibleWithMetabaseVersion({
      mbVersion,
      sdkVersion,
    });
  }, [mbVersion, sdkVersion]);

  if (isSdkCompatibleWithInstance) {
    return null;
  }

  const handlePageReload = () => {
    window.location.reload();
  };

  return (
    <SdkError
      type="floating"
      message={
        <span>{jt`The analytics server is undergoing maintenance. ${(
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
