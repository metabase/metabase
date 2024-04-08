import type * as React from "react";
import { t } from "ttag";

import { DEFAULT_FONT } from "embedding-sdk/config";
import { EmbeddingContext } from "embedding-sdk/context";
import { useInitData } from "embedding-sdk/hooks";
import type { SDKConfigType } from "embedding-sdk/types";

import { SdkContentWrapper } from "./SdkContentWrapper";
import type {AppStore} from "embedding-sdk/store/types";

interface AppInitializeControllerProps {
  store: AppStore;
  children: React.ReactNode;
  config: SDKConfigType;
}

export const AppInitializeController = ({
  store,
  config,
  children,
}: AppInitializeControllerProps) => {
  const { isLoggedIn, isInitialized } = useInitData({
    store,
    config,
  });

  return (
    <EmbeddingContext.Provider
      value={{
        isInitialized,
        isLoggedIn,
      }}
    >
      <SdkContentWrapper font={config.font ?? DEFAULT_FONT}>
        {!isInitialized ? <div>{t`Loading…`}</div> : children}
      </SdkContentWrapper>
    </EmbeddingContext.Provider>
  );
};
