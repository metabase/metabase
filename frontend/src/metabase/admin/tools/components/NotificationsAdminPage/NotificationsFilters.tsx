import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useListUsersQuery, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Button,
  Flex,
  Icon,
  Indicator,
  Input,
  Loader,
  Popover,
  Select,
  Stack,
  TextInput,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  CardId,
  NotificationChannelType,
  UserId,
} from "metabase-types/api";

import { type NotificationsUrlState, getChannelLabel } from "./utils";

type Props = {
  state: NotificationsUrlState;
  isFetching?: boolean;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

type ActiveFilterValue = "active" | "archived" | "all";

const getActiveOptions = (): {
  value: ActiveFilterValue;
  label: string;
}[] => [
  { value: "active", label: t`Active` },
  { value: "archived", label: t`Archived` },
  { value: "all", label: t`All` },
];

const activeUrlValue = (active: boolean | null): ActiveFilterValue =>
  match(active)
    .with(true, () => "active" as const)
    .with(false, () => "archived" as const)
    .otherwise(() => "all" as const);

const activeFromUrlValue = (value: ActiveFilterValue): boolean | null =>
  match(value)
    .with("active", () => true)
    .with("archived", () => false)
    .otherwise(() => null);

const getChannelOptions = (): {
  value: NotificationChannelType;
  label: string;
}[] => [
  { value: "channel/email", label: getChannelLabel("channel/email") },
  { value: "channel/slack", label: getChannelLabel("channel/slack") },
  { value: "channel/http", label: getChannelLabel("channel/http") },
];

const hasActiveAdvancedFilters = (state: NotificationsUrlState): boolean =>
  state.active !== true ||
  state.channel !== null ||
  state.creator_id !== null ||
  state.card_id !== null;

export const NotificationsFilters = ({
  state,
  isFetching = false,
  onChange,
}: Props) => {
  const activeOptions = getActiveOptions();
  const channelOptions = getChannelOptions();
  const hasAdvanced = hasActiveAdvancedFilters(state);

  return (
    <Flex gap="md" align="center">
      <QueryInput
        value={state.query}
        isLoading={isFetching}
        onChange={(query) => onChange({ query, page: 0 })}
      />

      <Popover position="bottom-end" shadow="md" withinPortal>
        <Popover.Target>
          <Indicator disabled={!hasAdvanced} size={8} offset={4}>
            <Button
              variant="default"
              leftSection={<Icon name="filter" />}
              aria-label={t`Show filters`}
            >
              {t`Filter`}
            </Button>
          </Indicator>
        </Popover.Target>
        <Popover.Dropdown p="md">
          <Stack gap="md" w={260}>
            <Select
              data={activeOptions}
              value={activeUrlValue(state.active)}
              placeholder={t`Filter by active`}
              label={t`Active`}
              onChange={(value) =>
                onChange({ active: activeFromUrlValue(value), page: 0 })
              }
              allowDeselect={false}
            />

            <Select
              data={channelOptions}
              value={state.channel}
              placeholder={t`Filter by channel`}
              label={t`Channel`}
              onChange={(value) => onChange({ channel: value, page: 0 })}
              clearable
            />

            <CreatorPicker
              value={state.creator_id}
              onChange={(creator_id) => onChange({ creator_id, page: 0 })}
            />

            <CardPicker
              value={state.card_id}
              onChange={(card_id) => onChange({ card_id, page: 0 })}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Flex>
  );
};

type QueryInputProps = {
  value: string;
  isLoading?: boolean;
  onChange: (value: string) => void;
};

const QueryInput = ({
  value,
  isLoading = false,
  onChange,
}: QueryInputProps) => {
  const [query, setQuery] = useState(value);
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_DURATION);
  const onChangeRef = useLatest(onChange);
  const lastPushedRef = useRef(value);

  useEffect(() => {
    if (debounced !== lastPushedRef.current) {
      lastPushedRef.current = debounced;
      onChangeRef.current(debounced);
    }
  }, [debounced, onChangeRef]);

  useEffect(() => {
    if (value !== lastPushedRef.current) {
      lastPushedRef.current = value;
      setQuery(value);
    }
  }, [value]);

  const showLoader = isLoading || query !== debounced;

  const renderRightSection = () => {
    if (showLoader) {
      return <Loader size="xs" />;
    }
    if (query === "") {
      return null;
    }
    return (
      <Input.ClearButton c="text-secondary" onClick={() => setQuery("")} />
    );
  };

  return (
    <TextInput
      flex={1}
      placeholder={t`Search by question or owner…`}
      value={query}
      styles={{ input: { borderRadius: 8 } }}
      onChange={(event) => setQuery(event.currentTarget.value)}
      leftSection={<Icon c="text-secondary" name="search" size={16} />}
      rightSectionPointerEvents="all"
      rightSection={renderRightSection()}
    />
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
      placeholder={isLoading ? t`Loading…` : t`Filter by creator`}
      label={t`Creator`}
      data={options}
      value={value == null ? null : String(value)}
      onChange={(next) => onChange(next ? Number(next) : null)}
      searchable
      clearable
      nothingFoundMessage={t`No users found`}
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
      placeholder={t`Filter by card`}
      label={t`Card`}
      data={options}
      value={value == null ? null : String(value)}
      onChange={(next) => onChange(next ? Number(next) : null)}
      onSearchChange={setSearch}
      searchable
      clearable
      nothingFoundMessage={
        isFetching ? t`Searching…` : t`Type to search for a card`
      }
    />
  );
};
