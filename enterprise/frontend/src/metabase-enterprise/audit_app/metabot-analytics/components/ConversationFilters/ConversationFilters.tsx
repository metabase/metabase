import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getOperatorDefaultValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import type {
  DateFilterValue,
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
const FIXED_TYPE_VALUE = "__date_filter_fixed__" as const;
const RELATIVE_TYPE_VALUE = "__date_filter_relative__" as const;

type ActiveDropdown = "default" | "fixed" | "relative";

type ConversationDateFilterProps = {
  value: string | null;
  onChange: (val: string) => void;
};

function getFilterStartDate(value: string): dayjs.Dayjs | null {
  const parsed: DateFilterValue | null = deserializeDateParameterValue(value);
  if (parsed?.type === "relative") {
    const base =
      parsed.offsetValue != null && parsed.offsetUnit != null
        ? dayjs().add(parsed.offsetValue, parsed.offsetUnit)
        : dayjs();
    if (parsed.value < 0) {
      return base.add(parsed.value, parsed.unit).startOf(parsed.unit);
    }
    return base.startOf(parsed.unit);
  }
  if (parsed?.type === "specific") {
    return parsed.values.reduce<dayjs.Dayjs | null>((acc, d) => {
      const candidate = dayjs(d);
      return acc == null || candidate.isBefore(acc) ? candidate : acc;
    }, null);
  }
  return null;
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
    const groups = [
      {
        group: "",
        items: [
          { label: t`Today`, value: "thisday" },
          { label: t`Yesterday`, value: "past1days" },
          { label: t`Last 7 days`, value: "past6days~" },
          { label: t`Last 30 days`, value: "past29days~" },
        ],
      },
      {
        group: "",
        items: [
          { label: t`Previous month`, value: "past1months" },
          { label: t`Previous 3 months`, value: "past3months" },
          { label: t`Previous 12 months`, value: "past12months" },
        ],
      },
      {
        group: "",
        items: [
          { label: t`Fixed date range…`, value: FIXED_TYPE_VALUE },
          { label: t`Relative date range…`, value: RELATIVE_TYPE_VALUE },
        ],
      },
    ];
    if (retentionCutoff == null) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const start = getFilterStartDate(item.value);
          return start == null || !start.isBefore(retentionCutoff);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [retentionCutoff]);

  // When `value` is a custom range that doesn't match a known shortcut, we
  // still want the matching Fixed/Relative entry to appear highlighted in the
  // dropdown so clicking it re-opens the picker. The trigger's displayed
  // label is overridden separately via `searchValue` so the user still sees
  // the formatted range.
  const parsedValue = useMemo(
    () => (value ? deserializeDateParameterValue(value) : null),
    [value],
  );
  const isKnownItem = useMemo(
    () =>
      value != null &&
      data.some((group) => group.items.some((item) => item.value === value)),
    [data, value],
  );
  const selectValue = useMemo(() => {
    if (value == null) {
      return null;
    }
    if (isKnownItem) {
      return value;
    }
    if (parsedValue?.type === "specific") {
      return FIXED_TYPE_VALUE;
    }
    if (parsedValue?.type === "relative") {
      return RELATIVE_TYPE_VALUE;
    }
    return null;
  }, [value, isKnownItem, parsedValue]);

  const searchValue = useMemo(() => {
    if (value == null || isKnownItem || parsedValue == null) {
      return undefined;
    }
    return getDateFilterDisplayName(parsedValue) ?? undefined;
  }, [value, isKnownItem, parsedValue]);

  const displayLabel = useMemo(() => {
    if (searchValue != null) {
      return searchValue;
    }
    return data
      .flatMap((group) => group.items)
      .find((item) => item.value === selectValue)?.label;
  }, [data, searchValue, selectValue]);

  const handleSelect = (val: string | null) => {
    match(val)
      .with(FIXED_TYPE_VALUE, () => setActiveDropdown("fixed"))
      .with(RELATIVE_TYPE_VALUE, () => setActiveDropdown("relative"))
      .with(P.string, onChange)
      .with(null, () => {})
      .exhaustive();
  };

  const customRangeSeed = match(activeDropdown)
    .with("fixed", () =>
      parsedValue?.type === "specific"
        ? value
        : serializeDateParameterValue(getOperatorDefaultValue("between")),
    )
    .with("relative", () =>
      parsedValue?.type === "relative" ? value : "past30days~",
    )
    .with("default", () => null)
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
          searchValue={searchValue}
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
          value={customRangeSeed}
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
