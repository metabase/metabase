import { t } from "ttag";

import { Group, Icon, Tabs, Text, Tooltip } from "metabase/ui";
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
  const tabs: TabConfig[] = [
    { value: "active", icon: "group", label: t`Active` },
    { value: "ended", icon: "history", label: t`Ended` },
  ];

  const handleTabChange = (value: string | null) => {
    const next = tabs.find((config) => config.value === value);
    if (next !== undefined) {
      onChange(next.value);
    }
  };

  return (
    <Group justify="space-between">
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
              leftSection={<Icon name={config.icon} />}
              data-testid={`sessions-tab-${config.value}`}
            >
              {config.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {tab === "ended" && (
        <Tooltip
          label={
            <Text
              c="inherit"
              fz="inherit"
            >{t`Ended sessions are kept for 30 days.`}</Text>
          }
          multiline
          maw="20rem"
          position="bottom-end"
        >
          <Icon name="info" c="text-secondary" />
        </Tooltip>
      )}
    </Group>
  );
};
