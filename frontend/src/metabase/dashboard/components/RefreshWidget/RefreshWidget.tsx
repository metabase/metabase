import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Popover } from "metabase/ui";

import { RefreshOption } from "./RefreshOption";
import { RefreshWidgetTarget } from "./RefreshWidgetTarget";

const toSeconds = (minutes: number) => minutes * 60;

const OPTIONS = [
  { name: t`Off`, period: null },
  { name: t`1 minute`, period: toSeconds(1) },
  { name: t`5 minutes`, period: toSeconds(5) },
  { name: t`10 minutes`, period: toSeconds(10) },
  { name: t`15 minutes`, period: toSeconds(15) },
  { name: t`30 minutes`, period: toSeconds(30) },
  { name: t`60 minutes`, period: toSeconds(60) },
];

export const RefreshWidget = ({
  setRefreshElapsedHook,
  period,
  onChangePeriod,
}: {
  setRefreshElapsedHook?: (hook: (elapsed: number | null) => void) => void;
  period: number | null;
  onChangePeriod: (period: number | null) => void;
}) => {
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
          <RefreshWidgetTarget elapsed={elapsed} period={period} />
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
            c="text-medium"
          >{t`Auto Refresh`}</Box>
          <ul>
            {OPTIONS.map(option => (
              <RefreshOption
                key={option.period}
                name={option.name}
                period={option.period}
                selected={option.period === period}
                onClick={() => {
                  setIsOpen(false);
                  onChangePeriod(option.period);
                }}
              />
            ))}
          </ul>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
