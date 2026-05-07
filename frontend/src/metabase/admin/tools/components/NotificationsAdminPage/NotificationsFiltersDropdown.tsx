import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Flex,
  Group,
  Icon,
  type IconName,
  Indicator,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  NotificationChannelType,
  NotificationRunStatus,
} from "metabase-types/api";

import {
  type NotificationsUrlState,
  getChannelIconName,
  getChannelLabel,
} from "./utils";

type Props = {
  state: NotificationsUrlState;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

const CHANNEL_VALUES: NotificationChannelType[] = [
  "channel/email",
  "channel/slack",
  "channel/http",
];

type FilterDraft = {
  channel: NotificationChannelType | null;
  owner_active: boolean | null;
  last_sent_status: NotificationRunStatus | null;
};

const stateToDraft = (state: NotificationsUrlState): FilterDraft => ({
  channel: state.channel,
  owner_active: state.owner_active,
  last_sent_status: state.last_sent_status,
});

const hasActiveFilters = (state: NotificationsUrlState): boolean => {
  if (state.channel !== null) {
    return true;
  }
  if (state.tab !== "failing" && state.last_sent_status !== null) {
    return true;
  }
  return state.tab !== "ownerless" && state.owner_active !== null;
};

export const NotificationsFiltersDropdown = ({ state, onChange }: Props) => {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(() => stateToDraft(state));
  const hasActive = hasActiveFilters(state);
  const isFailingTab = state.tab === "failing";
  const isOwnerlessTab = state.tab === "ownerless";

  useEffect(() => {
    if (opened) {
      setDraft(stateToDraft(state));
    }
  }, [opened, state]);

  const handleApply = () => {
    onChange({
      channel: draft.channel,
      owner_active: draft.owner_active,
      last_sent_status: draft.last_sent_status,
      page: 0,
    });
    setOpened(false);
  };

  const handleClear = () => {
    onChange({
      channel: null,
      owner_active: null,
      last_sent_status: null,
      page: 0,
    });
    setOpened(false);
  };

  const toggleChannel = (channel: NotificationChannelType) => {
    setDraft((prev) => ({
      ...prev,
      channel: prev.channel === channel ? null : channel,
    }));
  };

  const toggleOwnerActive = (ownerActive: boolean) => {
    setDraft((prev) => ({
      ...prev,
      owner_active: prev.owner_active === ownerActive ? null : ownerActive,
    }));
  };

  const toggleLastSentStatus = (status: NotificationRunStatus) => {
    setDraft((prev) => ({
      ...prev,
      last_sent_status: prev.last_sent_status === status ? null : status,
    }));
  };

  return (
    <Popover
      position="bottom-end"
      shadow="md"
      withinPortal
      opened={opened}
      onChange={setOpened}
    >
      <Popover.Target>
        <Indicator disabled={!hasActive} size={8} offset={4}>
          <Button
            variant="default"
            leftSection={<Icon name="filter" />}
            aria-label={t`Show filters`}
            onClick={() => setOpened((value) => !value)}
          >
            {t`Filter`}
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="xl" w={300}>
          <FilterSection label={t`Channel`}>
            {CHANNEL_VALUES.map((channel) => (
              <FilterPill
                key={channel}
                icon={getChannelIconName(channel)}
                label={getChannelLabel(channel)}
                selected={draft.channel === channel}
                onClick={() => toggleChannel(channel)}
              />
            ))}
          </FilterSection>

          {!isFailingTab && (
            <FilterSection label={t`Last send attempt`}>
              <FilterPill
                icon="verified_round"
                label={t`Successful`}
                selected={draft.last_sent_status === "successful"}
                onClick={() => toggleLastSentStatus("successful")}
              />
              <FilterPill
                icon="warning_round"
                label={t`Failed`}
                selected={draft.last_sent_status === "failing"}
                onClick={() => toggleLastSentStatus("failing")}
              />
            </FilterSection>
          )}

          {!isOwnerlessTab && (
            <FilterSection label={t`Owner`}>
              <FilterPill
                icon="person"
                label={t`Active`}
                selected={draft.owner_active === true}
                onClick={() => toggleOwnerActive(true)}
              />
              <FilterPill
                icon="ghost"
                label={t`Deactivated`}
                selected={draft.owner_active === false}
                onClick={() => toggleOwnerActive(false)}
              />
            </FilterSection>
          )}

          <Group gap="sm" grow>
            <Button variant="default" onClick={handleClear}>
              {t`Clear filters`}
            </Button>
            <Button onClick={handleApply}>{t`Apply`}</Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

type FilterSectionProps = {
  label: string;
  children: ReactNode;
};

const FilterSection = ({ label, children }: FilterSectionProps) => (
  <Stack gap="sm">
    <Text fw={700} fz="md" c="text-primary">
      {label}
    </Text>
    <Flex gap="sm" wrap="wrap">
      {children}
    </Flex>
  </Stack>
);

type FilterPillProps = {
  icon: IconName;
  label: string;
  selected: boolean;
  onClick: () => void;
};

const FilterPill = ({ icon, label, selected, onClick }: FilterPillProps) => (
  <UnstyledButton
    onClick={onClick}
    bg={selected ? "background-selected" : "background-primary"}
    bd="1px solid var(--mb-color-border)"
    px={12}
    py={8}
    style={{ borderRadius: 9999 }}
  >
    <Flex gap={8} align="center">
      <Icon name={icon} size={16} c="text-secondary" />
      <Text fz="md" c="text-primary" lh="16px">
        {label}
      </Text>
    </Flex>
  </UnstyledButton>
);
