import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { getOperatorDefaultValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import type { DatePickerOperator } from "metabase/querying/common/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Flex, Icon, Popover, Select } from "metabase/ui";

// width needed to show Previous 12 months option w/ clipping
const FILTER_WIDTH = 205;

const DATE_OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];
const FIXED_TYPE_VALUE = "__date_filter_fixed__" as const;
const RELATIVE_TYPE_VALUE = "__date_filter_relative__" as const;

type ActiveDropdown = "default" | "fixed" | "relative";

type ConversationDateFilterProps = {
  value: string | null;
  onChange: (val: string) => void;
};

function ConversationDateFilter({
  value,
  onChange,
}: ConversationDateFilterProps) {
  const [activeDropdown, setActiveDropdown] =
    useState<ActiveDropdown>("default");

  // `~` includes the current period by incrementing the day count, so `pastNdays~` spans N+1 days.
  // To get an N-day window ending today, use `past(N-1)days~`.
  const data = useMemo(
    () => [
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
    ],
    [],
  );

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
      serializeDateParameterValue(getOperatorDefaultValue("between")),
    )
    .with("relative", () => "past30days~")
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
          value={value}
          onChange={handleSelect}
          onDropdownOpen={() => setActiveDropdown("default")}
          w={FILTER_WIDTH}
          bdrs="sm"
          allowDeselect={false}
          leftSection={<Icon name="calendar" />}
          data-testid="conversation-filters-date-select"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DateAllOptionsWidget
          key={activeDropdown}
          value={customRangeSeed}
          availableOperators={DATE_OPERATORS}
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
