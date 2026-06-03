import cx from "classnames";
import { t } from "ttag";

import { FixedSizeIcon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./NavbarTabBar.module.css";

export type NavbarTab = "chats" | "app" | "data-studio";

type TabConfig = {
  value: NavbarTab;
  label: string;
  icon: IconName;
};

type Props = {
  activeTab: NavbarTab;
  onSelectTab: (tab: NavbarTab) => void;
  showDataStudioTab?: boolean;
};

export function NavbarTabBar({
  activeTab,
  onSelectTab,
  showDataStudioTab = true,
}: Props) {
  const tabs: TabConfig[] = [
    { value: "chats", label: t`Chats`, icon: "comment" },
    { value: "app", label: t`App`, icon: "dashboard" },
    ...(showDataStudioTab
      ? [
          {
            value: "data-studio" as const,
            label: t`Data Studio`,
            icon: "table" as IconName,
          },
        ]
      : []),
  ];

  return (
    <div className={S.tabBar} role="tablist" aria-label={t`Sidebar sections`}>
      {tabs.map((tab) => {
        const isSelected = tab.value === activeTab;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-label={tab.label}
            data-testid={`navbar-tab-${tab.value}`}
            className={cx(S.tab, { [S.tabSelected]: isSelected })}
            onClick={() => onSelectTab(tab.value)}
          >
            <FixedSizeIcon className={S.icon} name={tab.icon} size={14} />
            <span className={S.label}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
