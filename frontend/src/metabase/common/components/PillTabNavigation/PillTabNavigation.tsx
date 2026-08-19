import cx from "classnames";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useLocation } from "metabase/router";
import { Ellipsified, FixedSizeIcon, Flex } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./PillTabNavigation.module.css";

export type PillTab = {
  label: string;
  to: string;
  icon?: IconName;
  isGated?: boolean;
  isSelected?: boolean | ((pathname: string) => boolean);
};

type PillTabNavigationProps = {
  tabs: PillTab[];
};

function isTabSelected(tab: PillTab, pathname: string) {
  const { to, isSelected } = tab;
  return typeof isSelected === "function"
    ? isSelected(pathname)
    : (isSelected ?? to === pathname);
}

export function PillTabNavigation({ tabs }: PillTabNavigationProps) {
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
            <Ellipsified className={S.label}>{tab.label}</Ellipsified>
            {tab.isGated && <UpsellGem.New size={14} />}
          </Flex>
        );
      })}
    </Flex>
  );
}
