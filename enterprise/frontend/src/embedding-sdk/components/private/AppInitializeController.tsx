import type { Store } from "@reduxjs/toolkit";
import type * as React from "react";
import { t } from "ttag";

import { DEFAULT_FONT } from "../../config";
import { EmbeddingContext } from "../../context";
import { useInitData } from "../../hooks";
import type { SDKConfigType, EnterpriseState } from "../../types";

import { SdkContentWrapper } from "./SdkContentWrapper";

interface AppInitializeControllerProps {
  store: Store<EnterpriseState>;
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
