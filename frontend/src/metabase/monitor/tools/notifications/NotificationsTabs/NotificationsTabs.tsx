import { t } from "ttag";

import {
  PillTabNavigation,
  type TabCountState,
} from "metabase/common/components/PillTabNavigation";
import type { IconName } from "metabase-types/api";

import type {
  NotificationsTab,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";
import { trackAlertsManagementTabClicked } from "../analytics";

type Props = {
  tab: NotificationsTab;
  allCount: TabCountState;
  failingCount: TabCountState;
  ownerlessCount: TabCountState;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

type TabConfig = {
  value: NotificationsTab;
  icon: IconName;
  label: string;
  count: TabCountState;
  patch: Partial<NotificationsUrlState>;
};

export const NotificationsTabs = ({
  tab,
  allCount,
  failingCount,
  ownerlessCount,
  onChange,
}: Props) => {
  const tabs: TabConfig[] = [
    {
      value: "all",
      icon: "alert",
      label: t`All alerts`,
      count: allCount,
      patch: { tab: "all" },
    },
    {
      value: "failing",
      icon: "warning_round",
      label: t`Failing`,
      count: failingCount,
      // The Failing tab filters on last_check, and abandoned / query-failed runs have no last_send
      // (the default sort), so they'd sort to the bottom. Default this tab to last_check so the
      // alerts it exists to surface land at the top.
      patch: {
        tab: "failing",
        last_send_status: null,
        sort_column: "last_check",
        sort_direction: "desc",
      },
    },
    {
      value: "ownerless",
      icon: "ghost",
      label: t`Ownerless`,
      count: ownerlessCount,
      patch: { tab: "ownerless", creator_active: null },
    },
  ];

  return (
    <PillTabNavigation
      data-testid="notifications-admin-tabs"
      tabs={tabs.map((config) => ({
        label: config.label,
        icon: config.icon,
        count: config.count,
        isSelected: config.value === tab,
        "data-testid": `notifications-admin-tab-${config.value}`,
        onClick: () => {
          trackAlertsManagementTabClicked(config.value);
          onChange(config.patch);
        },
      }))}
    />
  );
};
