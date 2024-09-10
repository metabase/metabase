import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import { getSdkLicenseProblem } from "embedding-sdk/lib/user-warnings/license-problem";
import { useSdkSelector } from "embedding-sdk/store";
import { getIsInitialized } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";
import { useSelector } from "metabase/lib/redux";
import { getTokenFeature } from "metabase/setup/selectors";
import { Box } from "metabase/ui";

import { SdkGlobalStylesWrapper } from "./SdkGlobalStylesWrapper";
import { SdkLicenseProblemBanner } from "./SdkLicenseProblemBanner";

interface AppInitializeControllerProps {
  children: ReactNode;
  config: SDKConfig;
  className?: string;
}

export const AppInitializeController = ({
  config,
  children,
  className,
}: AppInitializeControllerProps) => {
  useInitData({ config });

  const isInitialized = useSdkSelector(getIsInitialized);

  const hasFeatureFlag = useSelector(state => {
    // When the settings endpoint has not been called, we assume that the feature is enabled.
    if (!state.settings.values?.["token-features"]) {
      return true;
    }

    // TODO: replace this with "embedding-sdk" once the token feature PR landed.
    return getTokenFeature(state, "embedding");
  });

  const licenseProblem = useMemo(() => {
    return getSdkLicenseProblem({ hasFeatureFlag, config });
  }, [hasFeatureFlag, config]);

  const content = useMemo(() => {
    if (!isInitialized) {
      return <div>{t`Loading…`}</div>;
    }

    if (licenseProblem?.severity === "error") {
      return null;
    }

    return children;
  }, [children, isInitialized, licenseProblem]);

  return (
    <SdkGlobalStylesWrapper
      baseUrl={config.metabaseInstanceUrl}
      id={EMBEDDING_SDK_ROOT_ELEMENT_ID}
      className={className}
    >
      {content}

      {licenseProblem && (
        <Box pos="absolute" bottom="15px" left="15px">
          <SdkLicenseProblemBanner problem={licenseProblem} />
        </Box>
      )}
    </SdkGlobalStylesWrapper>
  );
};
