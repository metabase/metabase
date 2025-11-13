import { useEffect } from "react";

import { EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getSdkBundleVersion } from "embedding-sdk-bundle/store/selectors";

export const useDefineSdkBundleVersion = () => {
  const sdkBundleVersion = useSdkSelector(getSdkBundleVersion);

  useEffect(() => {
    if (
      window.METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO?.version !==
      EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION
    ) {
      return;
    }

    window.METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO.version = sdkBundleVersion;
  }, [sdkBundleVersion]);
};
