import { useSdkUsageProblem } from "embedding-sdk-bundle/hooks/private/use-sdk-usage-problem";
import { getSessionTokenState } from "embedding-sdk-bundle/store/selectors";
import { useSdkSelector } from "embedding-sdk-bundle/store/use-sdk-selector";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { Box, Portal } from "metabase/ui";

import { SdkUsageProblemBanner } from "./SdkUsageProblemBanner";
import S from "./SdkUsageProblemBanner.module.css";

interface Props {
  authConfig: MetabaseAuthConfig;
  allowConsoleLog?: boolean;
  isLocalHost?: boolean;
}

export const SdkUsageProblemDisplay = ({
  authConfig,
  allowConsoleLog,
  isLocalHost,
}: Props) => {
  const session = useSdkSelector((state) => getSessionTokenState(state).token);

  const usageProblem = useSdkUsageProblem({
    authConfig,
    allowConsoleLog,
    session,
    isLocalHost,
  });

  if (!usageProblem) {
    return null;
  }

  return (
    <Portal target={`#${EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}`}>
      <Box pos="fixed" bottom="15px" left="15px" className={S.BannerContainer}>
        <SdkUsageProblemBanner problem={usageProblem} />
      </Box>
    </Portal>
  );
};
