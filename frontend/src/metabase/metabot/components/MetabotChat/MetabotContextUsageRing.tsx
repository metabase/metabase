import { c, t } from "ttag";

import { useSetting } from "metabase/settings";
import { Box, RingProgress, Text, Tooltip } from "metabase/ui";

import S from "./MetabotContextUsageRing.module.css";

const SIZE = 19;
const THICKNESS = 2.5;

interface MetabotContextUsageRingProps {
  percentUsage: number;
}

export const MetabotContextUsageRing = ({
  percentUsage,
}: MetabotContextUsageRingProps) => {
  const percent = Math.round(percentUsage);
  const metabotName = useSetting("metabot-name");

  return (
    <Tooltip
      label={c(
        "{0} is a percentage, {1} is the name of the AI assistant (default: Metabot)",
      ).t`You've used ${percent}% of ${metabotName}'s context window.`}
    >
      <Box
        className={S.indicator}
        data-testid="metabot-context-usage-ring"
        aria-label={t`${percent}% of the context window used`}
      >
        <RingProgress
          size={SIZE}
          thickness={THICKNESS}
          transitionDuration={300}
          rootColor="border-neutral-subtle"
          sections={[{ value: percent, color: "brand" }]}
        />
        <Text fz="sm" c="text-disabled" lh="1">
          {percent}%
        </Text>
      </Box>
    </Tooltip>
  );
};
