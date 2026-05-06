import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";

import S from "./PotentiallyInterestingMarker.module.css";

/**
 * Small colored dot used across the exploration UI to mark items whose
 * interestingness score passes the threshold (queries, groups, timelines).
 * On hover it reveals a "Potentially interesting" tooltip.
 */
export function PotentiallyInterestingMarker() {
  return (
    <Tooltip label={t`Potentially interesting`}>
      <Box
        aria-hidden
        // Stable hook for tests asserting the marker without depending on
        // the Tooltip's hover-only label render.
        data-testid="potentially-interesting-marker"
        w="0.375rem"
        h="0.375rem"
        bg="interesting"
        className={S.indicator}
      />
    </Tooltip>
  );
}
