import { t } from "ttag";

import { useMetabotUsage } from "metabase/metabot/hooks";
import { ActionIcon, Indicator, RingProgress, Tooltip } from "metabase/ui";

import S from "./MetabotUsageIndicator.module.css";
import { formatUsageText, getColor } from "./utils";

export function CompactUsageIndicator() {
  const { user, pool, mostConstrained, limitUnit } = useMetabotUsage();
  const otherScope = mostConstrained === user ? pool : user;
  const showSecondaryWarning = otherScope?.isNearLimit ?? false;

  if (!mostConstrained) {
    return null;
  }

  return (
    <Tooltip label={formatUsageText(mostConstrained, limitUnit)}>
      <ActionIcon className={S.actionIcon} role="status" component="div">
        <Indicator
          disabled={!showSecondaryWarning}
          color="warning"
          size={5}
          offset={1}
        >
          <RingProgress
            size={22}
            thickness={3}
            roundCaps
            rootColor="border"
            sections={[
              {
                value: mostConstrained.percent,
                color: getColor(mostConstrained),
              },
            ]}
            aria-label={t`AI usage`}
          />
        </Indicator>
      </ActionIcon>
    </Tooltip>
  );
}
