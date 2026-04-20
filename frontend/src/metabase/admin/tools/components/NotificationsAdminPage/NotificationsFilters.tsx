import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Flex, Select, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  CardId,
  NotificationChannelType,
  NotificationHealth,
  UserId,
} from "metabase-types/api";

import {
  type NotificationStatusFilter,
  type NotificationsUrlState,
  getChannelLabel,
  getHealthLabel,
} from "./utils";

type Props = {
  state: NotificationsUrlState;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

const getStatusOptions = (): {
  value: NotificationStatusFilter;
  label: string;
}[] => [
  { value: "active", label: t`Active` },
  { value: "archived", label: t`Archived` },
  { value: "all", label: t`All` },
];

const getHealthOptions = (): { value: NotificationHealth; label: string }[] => [
  { value: "healthy", label: getHealthLabel("healthy") },
  { value: "orphaned_card", label: getHealthLabel("orphaned_card") },
  { value: "orphaned_creator", label: getHealthLabel("orphaned_creator") },
  { value: "failing", label: getHealthLabel("failing") },
];

const getChannelOptions = (): {
  value: NotificationChannelType;
  label: string;
}[] => [
  { value: "channel/email", label: getChannelLabel("channel/email") },
  { value: "channel/slack", label: getChannelLabel("channel/slack") },
  { value: "channel/http", label: getChannelLabel("channel/http") },
];

export const NotificationsFilters = ({ state, onChange }: Props) => {
  const statusOptions = useMemo(() => getStatusOptions(), []);
  const healthOptions = useMemo(() => getHealthOptions(), []);
  const channelOptions = useMemo(() => getChannelOptions(), []);
  return (
    <Flex gap="md" wrap="wrap" align="flex-end">
      <Select
        label={t`Status`}
        data={statusOptions}
        value={state.status}
        onChange={(value) => {
          if (value) {
            onChange({
              status: value as NotificationStatusFilter,
              page: 0,
            });
          }
        }}
        allowDeselect={false}
        w={140}
      />

      <Select
        label={t`Health`}
        placeholder={t`Any`}
        data={healthOptions}
        value={state.health}
        onChange={(value) =>
          onChange({
            health: (value as NotificationHealth | null) ?? null,
            page: 0,
          })
        }
        clearable
        w={180}
      />

      <CreatorPicker
        value={state.creator_id}
        onChange={(creator_id) => onChange({ creator_id, page: 0 })}
      />

      <CardPicker
        value={state.card_id}
        onChange={(card_id) => onChange({ card_id, page: 0 })}
      />

      <TextInput
        label={t`Recipient email`}
        placeholder={t`someone@example.com`}
        value={state.recipient_email}
        onChange={(event) =>
          onChange({
            recipient_email: event.currentTarget.value,
            page: 0,
          })
        }
        w={220}
      />

      <Select
        label={t`Channel`}
        placeholder={t`Any`}
        data={channelOptions}
        value={state.channel}
        onChange={(value) =>
          onChange({
            channel: (value as NotificationChannelType | null) ?? null,
            page: 0,
          })
        }
        clearable
        w={160}
      />
    </Flex>
  );
};

type CreatorPickerProps = {
  value: UserId | null;
  onChange: (value: UserId | null) => void;
};

const CreatorPicker = ({ value, onChange }: CreatorPickerProps) => {
  const { data, isLoading } = useListUsersQuery({
    status: "all",
    limit: 500,
  });

  const options = useMemo(() => {
    const users = data?.data ?? [];
    return users.map((user) => ({
      value: String(user.id),
      label: user.common_name || user.email,
    }));
  }, [data]);

  return (
    <Select
      label={t`Creator`}
      placeholder={isLoading ? t`Loading…` : t`Any`}
      data={options}
      value={value == null ? null : String(value)}
      onChange={(next) => onChange(next ? Number(next) : null)}
      searchable
      clearable
      nothingFoundMessage={t`No users found`}
      w={200}
    />
  );
};

type CardPickerProps = {
  value: CardId | null;
  onChange: (value: CardId | null) => void;
};

const CardPicker = ({ value, onChange }: CardPickerProps) => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const { data, isFetching } = useSearchQuery(
    {
      models: ["card"],
      q: debouncedSearch || undefined,
      limit: 25,
    },
    { skip: !debouncedSearch && value == null },
  );

  const { data: selectedData } = useSearchQuery(
    {
      models: ["card"],
      ids: value != null ? [value] : [],
      limit: 1,
    },
    { skip: value == null },
  );

  const options = useMemo(() => {
    const results = data?.data ?? [];
    const merged = [...results];
    const selected = selectedData?.data?.[0];
    if (selected && !merged.some((item) => item.id === selected.id)) {
      merged.unshift(selected);
    }
    return merged
      .filter((item) => item.model === "card")
      .map((item) => ({
        value: String(item.id),
        label: String(item.name ?? item.id),
      }));
  }, [data, selectedData]);

  return (
    <Select
      label={t`Card`}
      placeholder={t`Search cards`}
      data={options}
      value={value == null ? null : String(value)}
      onChange={(next) => onChange(next ? Number(next) : null)}
      onSearchChange={setSearch}
      searchable
      clearable
      nothingFoundMessage={
        isFetching ? t`Searching…` : t`Type to search for a card`
      }
      w={240}
    />
  );
};
