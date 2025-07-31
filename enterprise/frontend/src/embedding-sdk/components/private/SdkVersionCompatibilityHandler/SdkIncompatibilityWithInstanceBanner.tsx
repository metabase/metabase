import { useEffect, useMemo } from "react";
import { jt, t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/PublicComponentWrapper";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import {
  isInvalidMetabaseVersion,
  isSdkVersionCompatibleWithMetabaseVersion,
} from "embedding-sdk/lib/version-utils";
import { useSdkSelector, useSdkStore } from "embedding-sdk/store";
import { setIsSdkCompatibleWithInstance } from "embedding-sdk/store/reducer";
import { getSetting } from "metabase/selectors/settings";
import { Anchor } from "metabase/ui";

export function SdkIncompatibilityWithInstanceBanner() {
  const { dispatch } = useSdkStore();
  const version = useSdkSelector((state) => getSetting(state, "version"));

  const mbVersion = version?.tag;
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

  useEffect(() => {
    dispatch(setIsSdkCompatibleWithInstance(isSdkCompatibleWithInstance));
  }, [dispatch, isSdkCompatibleWithInstance]);

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
        <span>{jt`Embedding SDK version incompatible with the Instance version. ${(
          <Anchor
            key="reload-page-button"
            data-testid="reload-page-button"
            onClick={handlePageReload}
          >{t`Reload the page`}</Anchor>
        )} to get the updated SDK version.`}</span>
      }
    />
  );
}
