import { EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useSdkUsageProblem } from "embedding-sdk/hooks/private/use-sdk-usage-problem";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { Box, Portal } from "metabase/ui";

import { SdkUsageProblemBanner } from "./SdkUsageProblemBanner";
import S from "./SdkUsageProblemBanner.module.css";

interface Props {
  authConfig: MetabaseAuthConfig;
  allowConsoleLog?: boolean;
}

export const SdkUsageProblemDisplay = ({
  authConfig,
  allowConsoleLog,
}: Props) => {
  const usageProblem = useSdkUsageProblem({ authConfig, allowConsoleLog });

  if (!usageProblem) {
    return null;
  }

  return (
    <Portal target={`#${EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID}`}>
      <Box pos="fixed" bottom="15px" left="15px" className={S.BannerContainer}>
        <SdkUsageProblemBanner problem={usageProblem} />
      </Box>
    </Portal>
  );
};
