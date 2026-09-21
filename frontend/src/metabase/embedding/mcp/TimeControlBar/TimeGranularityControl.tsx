import { t } from "ttag";

import { Box, DefaultSelectItem } from "metabase/ui";

import { TimeControlPopover } from "./TimeControlPopover";
import type { TimeGranularityConfig } from "./types";

export function TimeGranularityControl({
  timeGranularity,
}: {
  timeGranularity: TimeGranularityConfig;
}) {
  return (
    <TimeControlPopover label={timeGranularity.label}>
      {(closePopover) => (
        <Box p="sm" miw={180}>
          <DefaultSelectItem
            value="none"
            label={t`All time`}
            selected={!timeGranularity.currentUnit}
            onClick={() => {
              timeGranularity.onChange(null);
              closePopover();
            }}
            role="option"
          />

          {timeGranularity.availableItems.map(({ bucket, unit, label }) => (
            <DefaultSelectItem
              key={unit}
              value={unit}
              label={label}
              selected={timeGranularity.currentUnit === unit}
              onClick={() => {
                timeGranularity.onChange(bucket);
                closePopover();
              }}
              role="option"
            />
          ))}
        </Box>
      )}
    </TimeControlPopover>
  );
}
