import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import { getSdkLicenseProblem } from "embedding-sdk/lib/user-warnings/license-problem";
import { useSdkSelector } from "embedding-sdk/store";
import { getIsInitialized } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";
import { useHasTokenFeature } from "metabase/common/hooks";

import { SdkGlobalStylesWrapper } from "./SdkGlobalStylesWrapper";
import { SdkLicenseWarningBanner } from "./SdkLicenseWarningBanner";

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

  // TODO: replace this with "embedding-sdk" once the token feature PR landed.
  const hasFeatureFlag = useHasTokenFeature("embedding");

  const licenseProblem = useMemo(() => {
    return getSdkLicenseProblem({ hasFeatureFlag, config });
  }, [hasFeatureFlag, config]);

  const content = useMemo(() => {
    if (!isInitialized) {
      return <div>{t`Loading…`}</div>;
    }

    if (licenseProblem?.level === "error") {
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

      <SdkLicenseWarningBanner warning={licenseProblem} />
    </SdkGlobalStylesWrapper>
  );
};
