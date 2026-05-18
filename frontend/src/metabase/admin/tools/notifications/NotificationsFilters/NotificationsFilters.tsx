import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Flex,
  Group,
  Icon,
  Indicator,
  Popover,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type {
  IconName,
  NotificationChannelType,
  NotificationRunStatus,
} from "metabase-types/api";

import { CHANNEL_VALUES } from "../NotificationsAdminPage/constants";
import type {
  FilterDraft,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";
import {
  getChannelIconName,
  getChannelLabel,
} from "../NotificationsAdminPage/utils";

import { hasActiveFilters, stateToDraft } from "./utils";

type Props = {
  state: NotificationsUrlState;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

export const NotificationsFilters = ({ state, onChange }: Props) => {
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
      recipient_email: draft.recipient_email.trim(),
      page: 0,
    });
    setOpened(false);
  };

  const handleClear = () => {
    onChange({
      channel: null,
      owner_active: null,
      last_sent_status: null,
      recipient_email: "",
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
      <Popover.Dropdown p="lg">
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

          <FilterSection label={t`Email recipient`}>
            <TextInput
              w="100%"
              placeholder={t`recipient@metabase.com`}
              value={draft.recipient_email}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  recipient_email: event.currentTarget.value,
                }))
              }
            />
          </FilterSection>

          <Group gap="md" grow>
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
    py="sm"
    bdrs="xl"
  >
    <Flex gap="sm" align="center">
      <Icon name={icon} size={16} c="text-secondary" />
      <Text fz="md" c="text-primary" lh="16px">
        {label}
      </Text>
    </Flex>
  </UnstyledButton>
);
