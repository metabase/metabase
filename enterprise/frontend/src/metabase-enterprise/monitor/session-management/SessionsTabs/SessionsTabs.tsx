import { t } from "ttag";

import { MonitorPillTabs } from "metabase/monitor/components/MonitorPillTabs";
import { Group, Icon, Text, Tooltip } from "metabase/ui";

import type { SessionsTab } from "../SessionsPage/types";

type SessionsTabsProps = {
  tab: SessionsTab;
  onChange: (tab: SessionsTab) => void;
};

export const SessionsTabs = ({ tab, onChange }: SessionsTabsProps) => (
  <Group justify="space-between">
    <MonitorPillTabs
      value={tab}
      tabs={[
        { value: "active", icon: "group", label: t`Active` },
        { value: "ended", icon: "history", label: t`Ended` },
      ]}
      testIdPrefix="sessions"
      onChange={onChange}
    />
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
