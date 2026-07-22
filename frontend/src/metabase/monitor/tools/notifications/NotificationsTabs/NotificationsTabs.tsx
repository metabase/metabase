import { t } from "ttag";

import { Icon, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type {
  NotificationsTab,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";
import { trackAlertsManagementTabClicked } from "../analytics";

import S from "./NotificationsTabs.module.css";

type Props = {
  tab: NotificationsTab;
  failingCount: number;
  ownerlessCount: number;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

type TabConfig = {
  value: NotificationsTab;
  icon: IconName;
  label: string;
  patch: Partial<NotificationsUrlState>;
};

export const NotificationsTabs = ({
  tab,
  failingCount,
  ownerlessCount,
  onChange,
}: Props) => {
  if (failingCount === 0 && ownerlessCount === 0) {
    return null;
  }

  const tabs: TabConfig[] = [
    {
      value: "all",
      icon: "alert",
      label: t`All alerts`,
      patch: { tab: "all" },
    },
  ];

  if (failingCount > 0) {
    tabs.push({
      value: "failing",
      icon: "warning_round",
      label: t`Failing`,
      // The Failing tab filters on last_check, and abandoned / query-failed runs have no last_send
      // (the default sort), so they'd sort to the bottom. Default this tab to last_check so the
      // alerts it exists to surface land at the top.
      patch: {
        tab: "failing",
        last_send_status: null,
        sort_column: "last_check",
        sort_direction: "desc",
      },
    });
  }

  if (ownerlessCount > 0) {
    tabs.push({
      value: "ownerless",
      icon: "ghost",
      label: t`Ownerless`,
      patch: { tab: "ownerless", creator_active: null },
    });
  }

  const handleTabChange = (value: string | null) => {
    const next = tabs.find((config) => config.value === value);
    if (next !== undefined) {
      trackAlertsManagementTabClicked(next.value);
      onChange(next.patch);
    }
  };

  return (
    <Tabs
      variant="pills"
      value={tab}
      onChange={handleTabChange}
      radius="xl"
      data-testid="notifications-admin-tabs"
      classNames={{
        list: S.list,
        tab: S.tab,
        tabLabel: S.tabLabel,
        tabSection: S.tabSection,
      }}
    >
      <Tabs.List>
        {tabs.map((config) => (
          <Tabs.Tab
            key={config.value}
            value={config.value}
            leftSection={<Icon name={config.icon} size={16} />}
            data-testid={`notifications-admin-tab-${config.value}`}
          >
            {config.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
};
