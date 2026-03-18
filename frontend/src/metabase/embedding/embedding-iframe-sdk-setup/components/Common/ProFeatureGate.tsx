import type { ReactNode } from "react";
import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { Box, Flex, Tooltip } from "metabase/ui";

export const ProFeatureGate = ({
  isGated,
  children,
}: {
  isGated: boolean;
  children: ReactNode;
}) => {
  if (!isGated) {
    return children;
  }

  return (
    <Flex align="center" justify="space-between" w="100%">
      <Box style={{ cursor: "not-allowed" }}>
        <Box style={{ pointerEvents: "none" }}>{children}</Box>
      </Box>
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins can see the EmbedJS Wizard */}
      <Tooltip label={t`Available on Metabase Pro plans`}>
        <Flex align="center" style={{ cursor: "pointer" }}>
          <UpsellGem />
        </Flex>
      </Tooltip>
    </Flex>
  );
};
