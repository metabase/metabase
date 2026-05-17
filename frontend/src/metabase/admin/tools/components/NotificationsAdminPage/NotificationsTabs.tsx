import { t } from "ttag";

import { Flex, Icon, UnstyledButton } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { NotificationsTab, NotificationsUrlState } from "./utils";

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

  if (failingCount) {
    tabs.push({
      value: "failing",
      icon: "warning_round",
      label: t`Failing`,
      patch: { tab: "failing", last_sent_status: null },
    });
  }

  if (ownerlessCount) {
    tabs.push({
      value: "ownerless",
      icon: "ghost",
      label: t`Ownerless`,
      patch: { tab: "ownerless", owner_active: null },
    });
  }

  return (
    <Flex gap="md" align="center" data-testid="notifications-admin-tabs">
      {tabs.map((config) => {
        const isActive = config.value === tab;
        return (
          <UnstyledButton
            key={config.value}
            role="tab"
            aria-selected={isActive}
            data-testid={`notifications-admin-tab-${config.value}`}
            onClick={() => onChange(config.patch)}
            bg={isActive ? "background-selected" : "transparent"}
            c={isActive ? "brand" : "text-primary"}
            fw={700}
            fz="md"
            px={12}
            lh="24px"
            py={6}
            style={{ borderRadius: 68 }}
          >
            <Flex gap={8} align="center">
              <Icon name={config.icon} size={16} />
              {config.label}
            </Flex>
          </UnstyledButton>
        );
      })}
    </Flex>
  );
};
