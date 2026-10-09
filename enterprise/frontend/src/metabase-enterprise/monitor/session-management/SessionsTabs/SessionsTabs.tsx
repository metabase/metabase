import { t } from "ttag";

import {
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { useSessionCountsQuery } from "metabase-enterprise/api";
import type { IconName } from "metabase-types/api";

import type { SessionsTab } from "../SessionsPage/types";

type SessionsTabsProps = {
  tab: SessionsTab;
  onChange: (tab: SessionsTab) => void;
};

type TabConfig = {
  value: SessionsTab;
  icon: IconName;
  label: string;
};

export const SessionsTabs = ({ tab, onChange }: SessionsTabsProps) => {
  const { currentData: counts, isError } = useSessionCountsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const tabs: TabConfig[] = [
    { value: "active", icon: "key", label: t`Active` },
    { value: "ended", icon: "history", label: t`Ended` },
  ];

  return (
    <PillTabNavigation
      data-testid="sessions-tabs"
      tabs={tabs.map((config) => ({
        label: config.label,
        icon: config.icon,
        count: getTabCount({ value: counts?.[config.value], isError }),
        isSelected: config.value === tab,
        "data-testid": `sessions-tab-${config.value}`,
        onClick: () => onChange(config.value),
      }))}
    />
  );
};
