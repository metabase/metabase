import type { ReactNode } from "react";
import { t } from "ttag";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import { useSdkSelector } from "embedding-sdk/store";
import { getIsInitialized } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";

import { SdkGlobalStylesWrapper } from "./SdkGlobalStylesWrapper";

interface AppInitializeControllerProps {
  children: ReactNode;
  config: SDKConfig;
}

export const AppInitializeController = ({
  config,
  children,
}: AppInitializeControllerProps) => {
  useInitData({
    config,
  });

  const isInitialized = useSdkSelector(getIsInitialized);

  return (
    <SdkGlobalStylesWrapper
      baseUrl={config.metabaseInstanceUrl}
      id={EMBEDDING_SDK_ROOT_ELEMENT_ID}
    >
      {!isInitialized ? <div>{t`Loading…`}</div> : children}
    </SdkGlobalStylesWrapper>
  );
};
