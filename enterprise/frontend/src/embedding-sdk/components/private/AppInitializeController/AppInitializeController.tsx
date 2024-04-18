import type * as React from "react";
import { t } from "ttag";

import { DEFAULT_FONT } from "embedding-sdk/config";
import { EmbeddingContext } from "embedding-sdk/context";
import { useInitData } from "embedding-sdk/hooks";
import type { SDKConfigType } from "embedding-sdk/types";

import { SdkContentWrapper } from "../SdkContentWrapper";

interface AppInitializeControllerProps {
  children: React.ReactNode;
  config: SDKConfigType;
}

export const AppInitializeController = ({
  config,
  children,
}: AppInitializeControllerProps) => {

  useInitData({
    config,
  });

  const isLoggedIn

  return (
      <SdkContentWrapper font={config.font ?? DEFAULT_FONT}>
        {loginStatus?.status === "loading" ? <div>{t`Loading…`}</div> : children}
      </SdkContentWrapper>
  );
};
