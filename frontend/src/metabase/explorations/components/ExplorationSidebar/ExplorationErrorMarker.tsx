import { t } from "ttag";

import { Box, Tooltip } from "metabase/ui";

export function ExplorationErrorMarker({
  message,
}: {
  message?: string | null;
}) {
  return (
    <Tooltip label={message || t`Failed to generate`}>
      <Box
        aria-label={message || t`Failed to generate`}
        data-testid="exploration-error-marker"
        bg="feedback-negative"
        w="0.375rem"
        h="0.375rem"
        bdrs="50%"
        flex="none"
      />
    </Tooltip>
  );
}
