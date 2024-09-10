import { type ReactNode, useMemo } from "react";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import { useSdkLicenseProblem } from "embedding-sdk/hooks/private/use-sdk-license-problem";
import { useSdkSelector } from "embedding-sdk/store";
import { getIsInitialized } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";
import { Box } from "metabase/ui";

import { SdkLoader } from "./PublicComponentWrapper";
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
  const licenseProblem = useSdkLicenseProblem(config);

  const content = useMemo(() => {
    if (!isInitialized) {
      return <SdkLoader />;
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
        <Box pos="fixed" bottom="15px" left="15px">
          <SdkLicenseProblemBanner problem={licenseProblem} />
        </Box>
      )}
    </SdkGlobalStylesWrapper>
  );
};
