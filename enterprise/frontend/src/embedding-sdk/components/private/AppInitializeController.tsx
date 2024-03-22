import type * as React from "react";
import { useEffect } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setOptions } from "metabase/redux/embed";

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
  const dispatch = useDispatch();

  const font = config.font ?? "Lato";

  useEffect(() => {
    if (font) {
      dispatch(setOptions({ font }));
    }
  }, [dispatch, font]);

  return (
    <EmbeddingContext.Provider
      value={{
        isInitialized,
        isLoggedIn,
      }}
    >
      <SdkContentWrapper data-elementid="sdk-content-wrapper" font={font}>
        {!isInitialized ? <div>{t`Loading…`}</div> : children}
      </SdkContentWrapper>
    </EmbeddingContext.Provider>
  );
};
