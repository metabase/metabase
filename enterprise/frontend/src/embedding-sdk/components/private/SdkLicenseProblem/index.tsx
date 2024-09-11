import { useSdkLicenseProblem } from "embedding-sdk/hooks/private/use-sdk-license-problem";
import type { SDKConfig } from "embedding-sdk/types";
import { Box } from "metabase/ui";

import { SdkLicenseProblemBanner } from "./SdkLicenseProblemBanner";

interface Props {
  config: SDKConfig;
}

export const SdkLicenseProblemDisplay = ({ config }: Props) => {
  const licenseProblem = useSdkLicenseProblem(config);

  if (!licenseProblem) {
    return null;
  }

  return (
    <Box pos="fixed" bottom="15px" left="15px">
      <SdkLicenseProblemBanner problem={licenseProblem} />
    </Box>
  );
};
