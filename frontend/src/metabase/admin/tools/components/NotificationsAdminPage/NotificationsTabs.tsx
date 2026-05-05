import { t } from "ttag";

import { Flex, Icon, type IconName, UnstyledButton } from "metabase/ui";
import type { NotificationStatus } from "metabase-types/api";

import {
  type NotificationStatusTab,
  getStatusFromTab,
  getTabFromStatus,
} from "./utils";

type Props = {
  selectedStatus: NotificationStatus | null;
  onChange: (status: NotificationStatus | null) => void;
};

type TabConfig = {
  value: NotificationStatusTab;
  icon: IconName;
  label: string;
};

const getTabs = (): TabConfig[] => [
  { value: "all", icon: "alert", label: t`All alerts` },
  { value: "failing", icon: "warning_round", label: t`Failing` },
  {
    value: "orphaned_creator",
    icon: "ghost",
    label: t`Ownerless`,
  },
];

export const NotificationsTabs = ({ selectedStatus, onChange }: Props) => {
  const activeTab = getTabFromStatus(selectedStatus);

  return (
    <Flex gap="md" align="center" data-testid="notifications-admin-tabs">
      {getTabs().map((tab) => {
        const isActive = tab.value === activeTab;
        return (
          <UnstyledButton
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            data-testid={`notifications-admin-tab-${tab.value}`}
            onClick={() => onChange(getStatusFromTab(tab.value))}
            bg={isActive ? "background-selected" : "transparent"}
            c={isActive ? "brand" : "text-primary"}
            fw={700}
            size={"xl"}
            fz="md"
            px={12}
            lh={"24px"}
            py={6}
            style={{ borderRadius: 68 }}
          >
            <Flex gap={8} align="center">
              <Icon name={tab.icon} size={16} />
              {tab.label}
            </Flex>
          </UnstyledButton>
        );
      })}
    </Flex>
  );
};
