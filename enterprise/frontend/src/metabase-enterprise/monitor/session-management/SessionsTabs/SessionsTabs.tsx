import { t } from "ttag";

import { Icon, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { SessionsTab, SessionsUrlState } from "../SessionsPage/types";

type SessionsTabsProps = {
  tab: SessionsTab;
  onChange: (patch: Partial<SessionsUrlState>) => void;
};

type TabConfig = {
  value: SessionsTab;
  icon: IconName;
  label: string;
};

export const SessionsTabs = ({ tab, onChange }: SessionsTabsProps) => {
  const tabs: TabConfig[] = [
    { value: "active", icon: "key", label: t`Active` },
    { value: "ended", icon: "history", label: t`Ended` },
  ];

  const handleTabChange = (value: string | null) => {
    const next = tabs.find((config) => config.value === value);
    if (next !== undefined) {
      onChange({ tab: next.value });
    }
  };

  return (
    <Tabs
      variant="pills"
      value={tab}
      onChange={handleTabChange}
      data-testid="sessions-tabs"
    >
      <Tabs.List>
        {tabs.map((config) => (
          <Tabs.Tab
            key={config.value}
            value={config.value}
            leftSection={<Icon name={config.icon} size={16} />}
            data-testid={`sessions-tab-${config.value}`}
          >
            {config.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
};
