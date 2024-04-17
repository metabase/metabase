import type * as React from "react";
import { t } from "ttag";

import {
  DEFAULT_FONT,
  EMBEDDING_SDK_ROOT_ELEMENT_ID,
} from "embedding-sdk/config";
import { EmbeddingContext } from "embedding-sdk/context";
import { useInitData } from "embedding-sdk/hooks";
import type { SDKConfigType } from "embedding-sdk/types";

import { SdkContentWrapper } from "./SdkContentWrapper";

interface AppInitializeControllerProps {
  children: React.ReactNode;
  config: SDKConfigType;
}

export const AppInitializeController = ({
  config,
  children,
}: AppInitializeControllerProps) => {
  const { isLoggedIn, isInitialized } = useInitData({
    config,
  });

  return (
    <EmbeddingContext.Provider
      value={{
        isInitialized,
        isLoggedIn,
      }}
    >
      <SdkContentWrapper
        baseUrl={config.metabaseInstanceUrl}
        id={EMBEDDING_SDK_ROOT_ELEMENT_ID}
        font={config.font ?? DEFAULT_FONT}
      >
        {!isInitialized ? <div>{t`Loading…`}</div> : children}
      </SdkContentWrapper>
    </EmbeddingContext.Provider>
  );
};
