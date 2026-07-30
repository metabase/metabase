import cx from "classnames";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useLocation } from "metabase/router";
import { FixedSizeIcon, Flex } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MonitorHeaderTabs.module.css";

export type MonitorHeaderTab = {
  label: string;
  to: string;
  icon?: IconName;
  isGated?: boolean;
  isSelected?: boolean | ((pathname: string) => boolean);
};

type MonitorHeaderTabsProps = {
  tabs: MonitorHeaderTab[];
};

function isTabSelected(tab: MonitorHeaderTab, pathname: string) {
  const { to, isSelected } = tab;
  return typeof isSelected === "function"
    ? isSelected(pathname)
    : (isSelected ?? to === pathname);
}

/**
 * Each "tab" navigates to a real, bookmarkable route rather than switching in-place content, so
 * these are rendered as plain links with `aria-current="page"` (matching `AreaTab`) rather than
 * the ARIA tabs pattern (`role="tab"`/`tabpanel`) — that pattern implies activating a tab doesn't
 * navigate, which isn't true here.
 */
export function MonitorHeaderTabs({ tabs }: MonitorHeaderTabsProps) {
  const { pathname } = useLocation();

  return (
    <Flex component="nav" gap="xs" wrap="wrap">
      {tabs.map((tab) => {
        const selected = isTabSelected(tab, pathname);
        return (
          <Flex
            key={tab.label}
            component={ForwardRefLink}
            to={tab.to}
            align="center"
            gap="xs"
            className={cx(S.tab, { [S.selected]: selected })}
            aria-label={tab.label}
            aria-current={selected ? "page" : undefined}
          >
            {tab.icon !== undefined && <FixedSizeIcon name={tab.icon} />}
            <span className={S.label}>{tab.label}</span>
            {tab.isGated && <UpsellGem.New size={14} />}
          </Flex>
        );
      })}
    </Flex>
  );
}
