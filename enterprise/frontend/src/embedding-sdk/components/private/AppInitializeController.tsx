import type { ReactNode } from "react";
import { t } from "ttag";

import {
  DEFAULT_FONT,
  EMBEDDING_SDK_ROOT_ELEMENT_ID,
} from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import { useSdkSelector } from "embedding-sdk/store";
import { getIsInitialized } from "embedding-sdk/store/selectors";
import type { SDKConfigType } from "embedding-sdk/types";

import { SdkContentWrapper } from "./SdkContentWrapper";

interface AppInitializeControllerProps {
  children: ReactNode;
  config: SDKConfigType;
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
    <SdkContentWrapper
      baseUrl={config.metabaseInstanceUrl}
      id={EMBEDDING_SDK_ROOT_ELEMENT_ID}
      font={config.font ?? DEFAULT_FONT}
    >
      {!isInitialized ? <div>{t`Loading…`}</div> : children}
    </SdkContentWrapper>
  );
};
