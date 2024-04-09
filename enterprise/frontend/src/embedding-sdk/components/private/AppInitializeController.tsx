import { useState } from "react";
import { t } from "ttag";

import { DEFAULT_FONT } from "../../config";
import { EmbeddingContext } from "../../context";
import { useInitData } from "../../hooks";
import type { SDKConfigType } from "../../types";

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
        {!isInitialized ? <div>{t`Loading…`}</div> : children}
      </SdkContentWrapper>
    </EmbeddingContext.Provider>
  );
};
