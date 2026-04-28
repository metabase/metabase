import { useState } from "react";
import { t } from "ttag";

import type { DatePickerOperator } from "metabase/querying/common/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { Button, Flex, Popover, Select } from "metabase/ui";

import { getDateLabel } from "../ConversationStatsPage/utils";

const DATE_OPERATORS: DatePickerOperator[] = ["=", ">", "<", "between"];

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
  const [dateOpened, setDateOpened] = useState(false);

  return (
    <Flex gap="sm" wrap="wrap" align="center">
      <Popover
        opened={dateOpened}
        onChange={setDateOpened}
        position="bottom-start"
      >
        <Popover.Target>
          <Button variant="default" onClick={() => setDateOpened((o) => !o)}>
            {getDateLabel(date)}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <DateAllOptionsWidget
            value={null}
            availableOperators={DATE_OPERATORS}
            onChange={(val) => {
              onDateChange(val);
              setDateOpened(false);
            }}
          />
        </Popover.Dropdown>
      </Popover>
      {hasTenants && (
        <Select
          data={[{ value: "", label: t`All tenants` }, ...tenantOptions]}
          value={tenant ?? ""}
          onChange={(val) => onTenantChange(val === "" ? null : val)}
          searchable
          w={180}
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
        w={180}
        bdrs="sm"
        data-testid="conversation-filters-group-select"
      />
      <Select
        data={[{ value: "", label: t`All users` }, ...userOptions]}
        value={user ?? ""}
        onChange={(val) => onUserChange(val === "" ? null : val)}
        searchable
        w={180}
        bdrs="sm"
        data-testid="conversation-filters-user-select"
      />
    </Flex>
  );
}
