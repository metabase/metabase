import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useSdkLicenseProblem } from "embedding-sdk/hooks/private/use-sdk-license-problem";
import type { SDKConfig } from "embedding-sdk/types";
import { Box, Portal } from "metabase/ui";

import { SdkLicenseProblemBanner } from "./SdkLicenseProblemBanner";
import S from "./SdkLicenseProblemBanner.module.css";

interface Props {
  config: SDKConfig;
}

export const SdkLicenseProblemDisplay = ({ config }: Props) => {
  const licenseProblem = useSdkLicenseProblem(config);

  if (!licenseProblem) {
    return null;
  }

  return (
    <Portal target={`#${EMBEDDING_SDK_ROOT_ELEMENT_ID}`}>
      <Box pos="fixed" bottom="15px" left="15px" className={S.BannerContainer}>
        <SdkLicenseProblemBanner problem={licenseProblem} />
      </Box>
    </Portal>
  );
};
