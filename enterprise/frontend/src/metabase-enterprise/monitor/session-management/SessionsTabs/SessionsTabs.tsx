import { t } from "ttag";

import {
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { Group, Icon, Text, Tooltip } from "metabase/ui";
import { useGetSessionCountsQuery } from "metabase-enterprise/api";
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
  const { currentData: counts, isError } = useGetSessionCountsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const tabs: TabConfig[] = [
    { value: "active", icon: "group", label: t`Active` },
    { value: "ended", icon: "history", label: t`Ended` },
  ];

  return (
    <Group justify="space-between">
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
