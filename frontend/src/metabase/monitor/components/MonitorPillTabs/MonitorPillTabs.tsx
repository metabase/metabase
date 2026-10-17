import { Icon, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type MonitorPillTab<TTab extends string> = {
  value: TTab;
  icon: IconName;
  label: string;
};

type MonitorPillTabsProps<TTab extends string> = {
  value: TTab;
  tabs: MonitorPillTab<TTab>[];
  /** Prefixes the `-tabs` and `-tab-<value>` test ids. */
  testIdPrefix: string;
  onChange: (tab: TTab) => void;
};

export function MonitorPillTabs<TTab extends string>({
  value,
  tabs,
  testIdPrefix,
  onChange,
}: MonitorPillTabsProps<TTab>) {
  const handleTabChange = (next: string | null) => {
    const tab = tabs.find((config) => config.value === next);
    if (tab !== undefined) {
      onChange(tab.value);
    }
  };

  return (
    <Tabs
      variant="pills"
      value={value}
      onChange={handleTabChange}
      data-testid={`${testIdPrefix}-tabs`}
    >
      <Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            leftSection={<Icon name={tab.icon} />}
            data-testid={`${testIdPrefix}-tab-${tab.value}`}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
