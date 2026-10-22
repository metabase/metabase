import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

// how long the copied-confirmation feedback stays visible
export const COPY_TIMEOUT_MS = 2000;

export function LinkCopiedTooltipLabel({ message }: { message?: string }) {
  return (
    <Flex gap="sm" align="center">
      <Icon name="verified_round" size={16} />
      <Text fz="md" lh="sm" c="inherit">
        {message ?? t`Link copied to clipboard`}
      </Text>
    </Flex>
  );
}
