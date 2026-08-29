import { match } from "ts-pattern";
import { t } from "ttag";

import { Badge, Icon, Skeleton, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type {
  NotificationsTab,
  NotificationsUrlState,
  TabCountState,
} from "../NotificationsAdminPage/types";
import { trackAlertsManagementTabClicked } from "../analytics";

import S from "./NotificationsTabs.module.css";

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

const TabCountBadge = ({
  count,
  isActive,
}: {
  count: TabCountState;
  isActive: boolean;
}) =>
  match(count)
    .with({ status: "loading" }, () => (
      <Skeleton
        h={16}
        miw="1.5rem"
        radius="xl"
        data-testid="tab-count-skeleton"
      />
    ))
    .with({ status: "loaded" }, ({ value }) =>
      isActive ? (
        <Badge variant="filled" size="xs" color="brand" c="white">
          {value}
        </Badge>
      ) : (
        <Badge variant="light" size="xs" color="neutral">
          {value}
        </Badge>
      ),
    )
    .with({ status: "error" }, () => null)
    .exhaustive();

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

  const handleTabChange = (value: NotificationsTab | null) => {
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
            rightSection={
              <TabCountBadge
                count={config.count}
                isActive={config.value === tab}
              />
            }
            data-testid={`notifications-admin-tab-${config.value}`}
          >
            {config.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
};
