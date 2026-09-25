import { c, t } from "ttag";

import { Flex, Stack, Text, Tooltip } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";

import type { MetabotTokenUsage } from "../../state";

// at most one decimal, unpadded: 40k and 48.2k rather than formatNumber's 40.0k
const COMPACT_TOKEN_FORMATTER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// lowercase thousands, like the rest of the app's compact numbers
const formatCompactTokens = (tokens: number) =>
  COMPACT_TOKEN_FORMATTER.format(tokens).replace("K", "k");

interface MetabotTokenUsageCounterProps {
  usage: MetabotTokenUsage;
}

export const MetabotTokenUsageCounter = ({
  usage,
}: MetabotTokenUsageCounterProps) => {
  const inputTokens = formatCompactTokens(usage.inputTokens);
  const outputTokens = formatCompactTokens(usage.outputTokens);

  return (
    <Flex justify="flex-end" px="xs">
      <Tooltip label={<TokenUsageBreakdown usage={usage} />} position="top-end">
        <Text fz="xs" c="text-secondary" data-testid="metabot-token-usage">
          {c("{0} and {1} are token counts")
            .t`${inputTokens} in · ${outputTokens} out`}
        </Text>
      </Tooltip>
    </Flex>
  );
};

const TokenUsageBreakdown = ({ usage }: MetabotTokenUsageCounterProps) => {
  const inputTokens = formatNumber(usage.inputTokens);
  const cacheReadTokens = formatNumber(usage.cacheReadTokens);
  const cacheCreationTokens = formatNumber(usage.cacheCreationTokens);
  const outputTokens = formatNumber(usage.outputTokens);

  return (
    <Stack gap={2}>
      <Text fw="bold" c="inherit" fz="inherit">
        {t`Tokens used this session`}
      </Text>
      <Text c="inherit" fz="inherit">
        {c("{0} is a token count").t`Input: ${inputTokens}`}
      </Text>
      <Text c="inherit" fz="inherit" pl="sm">
        {c("{0} is a token count").t`Cache read: ${cacheReadTokens}`}
      </Text>
      <Text c="inherit" fz="inherit" pl="sm">
        {c("{0} is a token count").t`Cache write: ${cacheCreationTokens}`}
      </Text>
      <Text c="inherit" fz="inherit">
        {c("{0} is a token count").t`Output: ${outputTokens}`}
      </Text>
    </Stack>
  );
};
