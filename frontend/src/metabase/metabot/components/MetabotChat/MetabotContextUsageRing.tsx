import { c, t } from "ttag";

import { Center, RingProgress, Tooltip } from "metabase/ui";

const SIZE = 17;
const THICKNESS = 2.5;

interface MetabotContextUsageRingProps {
  percentUsage: number;
  className?: string;
}

export const MetabotContextUsageRing = ({
  percentUsage,
  className,
}: MetabotContextUsageRingProps) => {
  const percent = Math.round(percentUsage);

  return (
    <Tooltip
      label={c("{0} is a percentage").t`${percent}% context used`}
      position="top-end"
    >
      <Center
        className={className}
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
      </Center>
    </Tooltip>
  );
};
