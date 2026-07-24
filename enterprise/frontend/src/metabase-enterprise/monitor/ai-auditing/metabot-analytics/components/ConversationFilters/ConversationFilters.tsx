import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getOperatorDefaultValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import type {
  DatePickerOperator,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import { Flex, Icon, Popover, Select } from "metabase/ui";

// width needed to show Previous 12 months option w/ clipping
const FILTER_WIDTH = 205;

const DATE_OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];
const RELATIVE_DIRECTIONS: RelativeIntervalDirection[] = ["past", "current"];
const SPECIFIC_TYPE_VALUE = "__date_filter_specific__" as const;
const RELATIVE_TYPE_VALUE = "__date_filter_relative__" as const;

type ActiveDropdown = "default" | "specific" | "relative";

const CUSTOM_RANGE_DEFAULT: Record<
  Exclude<ActiveDropdown, "default">,
  string
> = {
  specific: serializeDateParameterValue(getOperatorDefaultValue("between")),
  relative: "past30days~",
};

type ConversationDateFilterProps = {
  value: string | null;
  onChange: (val: string) => void;
};

function getShortcutStartDate(value: string): dayjs.Dayjs | null {
  const parsed = deserializeDateParameterValue(value);
  if (parsed?.type !== "relative") {
    return null;
  }
  return dayjs()
    .add(parsed.offsetValue ?? 0, parsed.offsetUnit ?? "day")
    .add(Math.min(parsed.value, 0), parsed.unit)
    .startOf(parsed.unit);
}

function ConversationDateFilter({
  value,
  onChange,
}: ConversationDateFilterProps) {
  const [activeDropdown, setActiveDropdown] =
    useState<ActiveDropdown>("default");
  const retentionDays = useSetting("ai-usage-max-retention-days");
  const retentionCutoff = useMemo(
    () =>
      retentionDays == null
        ? null
        : dayjs().subtract(retentionDays, "day").startOf("day"),
    [retentionDays],
  );
  const todayCutoff = useMemo(() => dayjs().endOf("day"), []);

  // `~` includes the current period by incrementing the day count, so `pastNdays~` spans N+1 days.
  // To get an N-day window ending today, use `past(N-1)days~`.
  const data = useMemo(() => {
    const withinRetention = (item: { value: string }) =>
      !retentionCutoff ||
      !getShortcutStartDate(item.value)?.isBefore(retentionCutoff);

    return [
      {
        group: "",
        items: [
          { label: t`Today`, value: "thisday" },
          { label: t`Yesterday`, value: "past1days" },
          { label: t`Last 7 days`, value: "past6days~" },
          { label: t`Last 30 days`, value: "past29days~" },
        ].filter(withinRetention),
      },
      {
        group: "",
        items: [
          { label: t`Previous month`, value: "past1months" },
          { label: t`Previous 3 months`, value: "past3months" },
          { label: t`Previous 12 months`, value: "past12months" },
        ].filter(withinRetention),
      },
      {
        group: "",
        items: [
          { label: t`Fixed date range…`, value: SPECIFIC_TYPE_VALUE },
          { label: t`Relative date range…`, value: RELATIVE_TYPE_VALUE },
        ],
      },
    ].filter((group) => group.items.length > 0);
  }, [retentionCutoff]);

  // when `value` is a specific / relative range, we want to show the item
  // as highlighted and make sure the correct value is populated in the inner
  // dropdowns, all while presenting this as the expanded time range to the user
  // in the input label (e.g. March 15 2026 - March 19 2026)
  const parsedValue = value ? deserializeDateParameterValue(value) : null;
  const isKnownItem =
    value != null &&
    data.some((group) => group.items.some((item) => item.value === value));

  const selectValue = match({
    hasValue: value != null,
    isKnownItem,
    parsedType: parsedValue?.type,
  })
    .with({ hasValue: false }, () => null)
    .with({ isKnownItem: true }, () => value)
    .with({ parsedType: "specific" }, () => SPECIFIC_TYPE_VALUE)
    .with({ parsedType: "relative" }, () => RELATIVE_TYPE_VALUE)
    .otherwise(() => null);

  const customDisplayName =
    !isKnownItem && parsedValue
      ? (getDateFilterDisplayName(parsedValue) ?? undefined)
      : undefined;
  const displayLabel =
    customDisplayName ??
    data
      .flatMap((group) => group.items)
      .find((item) => item.value === selectValue)?.label;

  const handleSelect = (val: string | null) => {
    match(val)
      .with(SPECIFIC_TYPE_VALUE, () => setActiveDropdown("specific"))
      .with(RELATIVE_TYPE_VALUE, () => setActiveDropdown("relative"))
      .with(P.string, onChange)
      .with(null, () => {})
      .exhaustive();
  };

  const customRangeValue = match({
    activeDropdown,
    parsedType: parsedValue?.type,
  })
    .with({ activeDropdown: "default" }, () => null)
    .with({ activeDropdown: "specific", parsedType: "specific" }, () => value)
    .with({ activeDropdown: "relative", parsedType: "relative" }, () => value)
    .with({ activeDropdown: "specific" }, () => CUSTOM_RANGE_DEFAULT.specific)
    .with({ activeDropdown: "relative" }, () => CUSTOM_RANGE_DEFAULT.relative)
    .exhaustive();

  return (
    <Popover
      opened={activeDropdown !== "default"}
      onChange={(opened) => {
        if (!opened) {
          setActiveDropdown("default");
        }
      }}
      position="bottom-start"
    >
      <Popover.Target>
        <Select
          data={data}
          value={selectValue}
          searchValue={customDisplayName}
          onChange={() => {}}
          onSearchChange={() => {}}
          onOptionSubmit={handleSelect}
          onDropdownOpen={() => setActiveDropdown("default")}
          w={FILTER_WIDTH}
          bdrs="sm"
          allowDeselect={false}
          leftSection={<Icon name="calendar" />}
          title={displayLabel}
          data-testid="conversation-filters-date-select"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DateAllOptionsWidget
          key={activeDropdown}
          value={customRangeValue}
          availableOperators={DATE_OPERATORS}
          availableDirections={RELATIVE_DIRECTIONS}
          minDate={retentionCutoff?.toDate()}
          maxDate={todayCutoff.toDate()}
          onChange={(val) => {
            onChange(val);
            setActiveDropdown("default");
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type ConversationFiltersProps = {
  date: string | null;
  onDateChange: (val: string) => void;
  user: string | null;
  onUserChange: (val: string | null) => void;
  group: string | null;
  onGroupChange: (val: string | null) => void;
  groupNoFilterValue: string;
  tenant: string | null;
  onTenantChange: (val: string | null) => void;
  userOptions: { value: string; label: string }[];
  groupOptions: { value: string; label: string }[];
  tenantOptions: { value: string; label: string }[];
  hasTenants: boolean;
};

export function ConversationFilters({
  date,
  onDateChange,
  user,
  onUserChange,
  group,
  onGroupChange,
  groupNoFilterValue,
  tenant,
  onTenantChange,
  userOptions,
  groupOptions,
  tenantOptions,
  hasTenants,
}: ConversationFiltersProps) {
  return (
    <Flex gap="sm" wrap="wrap" align="center">
      {hasTenants && (
        <Select
          data={[{ value: "", label: t`All tenants` }, ...tenantOptions]}
          value={tenant ?? ""}
          onChange={(val) => onTenantChange(val === "" ? null : val)}
          searchable
          w={FILTER_WIDTH}
          bdrs="sm"
          data-testid="conversation-filters-tenant-select"
        />
      )}
      <Select
        placeholder={t`Group`}
        data={groupOptions}
        value={group ?? groupNoFilterValue}
        onChange={(val) =>
          onGroupChange(val === groupNoFilterValue ? null : val)
        }
        searchable
        w={FILTER_WIDTH}
        bdrs="sm"
        data-testid="conversation-filters-group-select"
      />
      <Select
        data={[{ value: "", label: t`All users` }, ...userOptions]}
        value={user ?? ""}
        onChange={(val) => onUserChange(val === "" ? null : val)}
        searchable
        w={FILTER_WIDTH}
        bdrs="sm"
        data-testid="conversation-filters-user-select"
      />
      <ConversationDateFilter value={date} onChange={onDateChange} />
    </Flex>
  );
}
