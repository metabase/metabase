import type * as React from "react";
import { useState } from "react";
import { t } from "ttag";

import { DEFAULT_FONT } from "embedding-sdk/config";
import { EmbeddingContext } from "embedding-sdk/context";
import { useInitData } from "embedding-sdk/hooks";
import type { SDKConfigType } from "embedding-sdk/types";
import { FontWrapper } from "metabase/styled-components/FontWrapper";

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

  const [font, setFont] = useState(config.font ?? DEFAULT_FONT);

  return (
    <EmbeddingContext.Provider
      value={{
        isInitialized,
        isLoggedIn,
        font,
        setFont,
      }}
    >
      <SdkContentWrapper font={config.font ?? DEFAULT_FONT}>
        <FontWrapper baseUrl={config.metabaseInstanceUrl}>
          {!isInitialized ? <div>{t`Loading…`}</div> : children}
        </FontWrapper>
      </SdkContentWrapper>
    </EmbeddingContext.Provider>
  );
};
