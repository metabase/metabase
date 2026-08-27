import { t } from "ttag";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { Button, Flex } from "metabase/ui";

import { TimeControlPopover } from "./TimeControlPopover";
import type { TimeRangeConfig } from "./types";

export function TimeRangeControl({
  timeRange,
}: {
  timeRange: TimeRangeConfig;
}) {
  return (
    <TimeControlPopover label={timeRange.label}>
      {(closePopover) => (
        <DatePicker
          value={timeRange.value}
          availableUnits={timeRange.availableUnits}
          onChange={(value) => {
            timeRange.onChange(value);
            closePopover();
          }}
          renderSubmitButton={({ value }) => (
            <Flex justify="space-between" w="100%">
              {timeRange.hasActiveFilter ? (
                <Button
                  variant="subtle"
                  c="text-secondary"
                  onClick={() => {
                    timeRange.onClear();
                    closePopover();
                  }}
                >
                  {t`All time`}
                </Button>
              ) : (
                <div />
              )}

              <Button
                type="submit"
                variant="filled"
                disabled={!value}
              >{t`Apply`}</Button>
            </Flex>
          )}
        />
      )}
    </TimeControlPopover>
  );
}
