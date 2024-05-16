import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";
import { usePrevious, useUpdateEffect } from "react-use";
import { t } from "ttag";

import CountdownIcon from "metabase/components/icons/CountdownIcon";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { Tooltip, Popover, Icon, Box } from "metabase/ui";

import RefreshWidgetS from "./RefreshWidget.module.css";

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
  period: number;
  onChangePeriod: (period: number | null) => void;
}) => {
  const prevProps = usePrevious({ setRefreshElapsedHook });

  const [elapsed, setElapsed] = useState<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  useUpdateEffect(() => {
    if (
      setRefreshElapsedHook &&
      prevProps?.setRefreshElapsedHook !== setRefreshElapsedHook
    ) {
      setRefreshElapsedHook((elapsed: number | null) => {
        setElapsed(elapsed);
      });
    }
  });

  const remaining = period - (elapsed ?? 0);

  return (
    <Popover position="bottom-end" opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Box onClick={() => setIsOpen(!isOpen)}>
          {elapsed == null ? (
            <Tooltip label={t`Auto-refresh`}>
              <DashboardHeaderButton
                icon="clock"
                aria-label={t`Auto Refresh`}
              />
            </Tooltip>
          ) : (
            <Tooltip
              label={
                t`Refreshing in` +
                " " +
                Math.floor(remaining / 60) +
                ":" +
                (remaining % 60 < 10 ? "0" : "") +
                Math.round(remaining % 60)
              }
            >
              <DashboardHeaderButton
                icon={
                  <CountdownIcon
                    width={16}
                    height={16}
                    percent={Math.min(0.95, (period - elapsed) / period)}
                  />
                }
                aria-label={t`Auto Refresh`}
              />
            </Tooltip>
          )}
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Box className={RefreshWidgetS.RefreshWidgetPopover}>
          <Box
            className={RefreshWidgetS.RefreshWidgetTitle}
          >{t`Auto Refresh`}</Box>
          <RefreshOptionList>
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
          </RefreshOptionList>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};

const RefreshOptionList = ({ children }: { children: ReactNode }) => (
  <ul>{children}</ul>
);

const RefreshOption = ({
  name,
  period,
  selected,
  onClick,
}: {
  name: string;
  period: number | null;
  selected: boolean;
  onClick: () => void;
}) => (
  <li
    className={cx(RefreshWidgetS.RefreshOptionItem, {
      [RefreshWidgetS.Selected]: selected,
      [RefreshWidgetS.Enabled]: period != null,
    })}
    onClick={onClick}
  >
    <Icon className={RefreshWidgetS.RefreshOptionIcon} name="check" />
    <span>{name}</span>
  </li>
);
