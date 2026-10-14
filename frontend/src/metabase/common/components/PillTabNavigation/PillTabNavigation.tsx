import cx from "classnames";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useLocation } from "metabase/router";
import { Ellipsified, FixedSizeIcon, Flex } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./PillTabNavigation.module.css";
import { TabCountBadge, type TabCountState } from "./TabCountBadge";

export type PillTab = {
  label: string;
  icon?: IconName;
  isGated?: boolean;
  count?: TabCountState;
  isSelected?: boolean | ((pathname: string) => boolean);
  "data-testid"?: string;
} & (
  | { to: string; onClick?: () => void }
  | { to?: never; onClick: () => void }
);

type PillTabNavigationProps = {
  tabs: PillTab[];
  "data-testid"?: string;
};

function isTabSelected(tab: PillTab, pathname: string) {
  const { to, isSelected } = tab;
  return typeof isSelected === "function"
    ? isSelected(pathname)
    : (isSelected ?? to === pathname);
}

export function PillTabNavigation({
  tabs,
  "data-testid": testId,
}: PillTabNavigationProps) {
  const { pathname } = useLocation();

  return (
    <Flex component="nav" gap="xxs" wrap="wrap" data-testid={testId}>
      {tabs.map((tab) => {
        const selected = isTabSelected(tab, pathname);
        const tabProps = {
          align: "center",
          gap: "xxs",
          className: cx(S.tab, { [S.selected]: selected }),
          "aria-label": tab.label,
          "aria-current": selected ? "page" : undefined,
          "data-testid": tab["data-testid"],
          onClick: tab.onClick,
        } as const;
        const content = (
          <>
            {tab.icon !== undefined && <FixedSizeIcon name={tab.icon} />}
            <Ellipsified className={S.label}>{tab.label}</Ellipsified>
            {tab.count !== undefined && <TabCountBadge count={tab.count} />}
            {tab.isGated && <UpsellGem.New size={14} />}
          </>
        );
        return tab.to === undefined ? (
          <Flex key={tab.label} component="button" type="button" {...tabProps}>
            {content}
          </Flex>
        ) : (
          <Flex
            key={tab.label}
            component={ForwardRefLink}
            to={tab.to}
            {...tabProps}
          >
            {content}
          </Flex>
        );
      })}
    </Flex>
  );
}
