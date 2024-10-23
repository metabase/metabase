import { EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useSdkUsageProblem } from "embedding-sdk/hooks/private/use-sdk-usage-problem";
import type { SDKConfig } from "embedding-sdk/types";
import { Box, Portal } from "metabase/ui";

import { SdkUsageProblemBanner } from "./SdkUsageProblemBanner";
import S from "./SdkUsageProblemBanner.module.css";

interface Props {
  config: SDKConfig;
}

export const SdkUsageProblemDisplay = ({ config }: Props) => {
  const usageProblem = useSdkUsageProblem(config);

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
