import { type ButtonHTMLAttributes, useEffect, useState } from "react";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { type ActionIconProps, Box, Popover } from "metabase/ui";

import { RefreshOption } from "./RefreshOption";
import { RefreshWidgetTarget } from "./RefreshWidgetTarget";
import { AUTO_REFRESH_OPTIONS } from "./options";

export const RefreshWidget = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { setRefreshElapsedHook, refreshPeriod, onRefreshPeriodChange } =
    useDashboardContext();

  const [elapsed, setElapsed] = useState<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (setRefreshElapsedHook) {
      setRefreshElapsedHook((elapsed: number | null) => {
        setElapsed(elapsed);
      });
    }
  }, [setRefreshElapsedHook]);

  return (
    <Popover position="bottom-end" opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Box onClick={() => setIsOpen(!isOpen)}>
          <RefreshWidgetTarget
            elapsed={elapsed}
            period={refreshPeriod}
            {...props}
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="md" miw="12.5rem">
          <Box
            fw="bold"
            fz="sm"
            tt="uppercase"
            mb="md"
            ml="sm"
            c="text-secondary"
          >{t`Auto Refresh`}</Box>
          <ul>
            {AUTO_REFRESH_OPTIONS.map((option) => (
              <RefreshOption
                key={option.period}
                name={option.name}
                period={option.period}
                selected={option.period === refreshPeriod}
                onClick={() => {
                  setIsOpen(false);
                  onRefreshPeriodChange(option.period);
                }}
              />
            ))}
          </ul>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
