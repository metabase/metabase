import { useState } from "react";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { Box, type BoxProps, Popover } from "metabase/ui";

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

const RefreshPanel = ({
  onClick,
  ...boxProps
}: { onClick?: () => void } & BoxProps) => {
  const { onRefreshPeriodChange, refreshPeriod: period } =
    useDashboardContext();

  return (
    <Box {...boxProps}>
      <Box
        fw="bold"
        fz="sm"
        tt="uppercase"
        mb="md"
        ml="sm"
        c="text-medium"
      >{t`Auto Refresh`}</Box>
      <ul>
        {OPTIONS.map((option) => (
          <RefreshOption
            key={option.period}
            name={option.name}
            period={option.period}
            selected={option.period === period}
            onClick={() => {
              onClick?.();
              onRefreshPeriodChange(option.period);
            }}
          />
        ))}
      </ul>
    </Box>
  );
};

export const RefreshWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  const { refreshPeriod: period, elapsed } = useDashboardContext();
  return (
    <Popover position="bottom-end" opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Box onClick={() => setIsOpen(!isOpen)}>
          <RefreshWidgetTarget elapsed={elapsed} period={period} />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <RefreshPanel p="md" miw="12.5rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
