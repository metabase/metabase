import cx from "classnames";
import { type KeyboardEvent, useId } from "react";

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

function getFocusTargetIndex(key: string, index: number, count: number) {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

function handleTabKeyDown(event: KeyboardEvent<HTMLElement>) {
  const hasModifier =
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  if (hasModifier) {
    return;
  }
  const tabs = Array.from(
    event.currentTarget
      .closest("[data-pill-tab-navigation]")
      ?.querySelectorAll<HTMLElement>("[data-pill-tab]") ?? [],
  );
  const index = tabs.indexOf(event.currentTarget);
  const targetIndex = getFocusTargetIndex(event.key, index, tabs.length);
  if (tabs.length < 2 || index === -1 || targetIndex === null) {
    return;
  }
  event.preventDefault();
  tabs[targetIndex].focus();
}

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
  const countIdPrefix = useId();

  return (
    <Flex
      component="nav"
      gap="xxs"
      wrap="wrap"
      data-pill-tab-navigation
      data-testid={testId}
    >
      {tabs.map((tab, index) => {
        const selected = isTabSelected(tab, pathname);
        const countId = `${countIdPrefix}-count-${index}`;
        const hasLoadedCount = tab.count?.status === "loaded";
        const tabProps = {
          align: "center",
          gap: "xxs",
          className: cx(S.tab, { [S.selected]: selected }),
          "aria-label": tab.label,
          "aria-describedby": hasLoadedCount ? countId : undefined,
          "aria-current": selected ? "page" : undefined,
          "data-testid": tab["data-testid"],
          onClick: tab.onClick,
          onKeyDown: handleTabKeyDown,
          "data-pill-tab": true,
        } as const;
        const content = (
          <>
            {tab.icon !== undefined && <FixedSizeIcon name={tab.icon} />}
            <Ellipsified className={S.label}>{tab.label}</Ellipsified>
            {tab.count !== undefined && (
              <TabCountBadge id={countId} count={tab.count} />
            )}
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
