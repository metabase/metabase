import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";

const COMMON_STYLE_PROPS = {
  w: "0.375rem",
  h: "0.375rem",
  bdrs: "50%",
  flex: "none",
};

export function PotentiallyInterestingMarker() {
  return (
    <Tooltip label={t`Potentially interesting`}>
      <Box
        aria-hidden
        // Stable hook for tests asserting the marker without depending on
        // the Tooltip's hover-only label render.
        data-testid="potentially-interesting-marker"
        bg="brand"
        {...COMMON_STYLE_PROPS}
      />
    </Tooltip>
  );
}

export function ExplorationErrorMarker({
  message,
}: {
  message?: string | null;
}) {
  return (
    <Tooltip label={message || t`Failed to generate`}>
      <Box
        aria-label={t`Failed to generate`}
        data-testid="exploration-error-marker"
        bg="feedback-negative"
        {...COMMON_STYLE_PROPS}
      />
    </Tooltip>
  );
}
