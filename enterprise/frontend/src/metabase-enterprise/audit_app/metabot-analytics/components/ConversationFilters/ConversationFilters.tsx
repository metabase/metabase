import { useState } from "react";
import { t } from "ttag";

import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { Button, Flex, Popover, Select } from "metabase/ui";

import { getDateLabel } from "../ConversationStatsPage/utils";

type ConversationFiltersProps = {
  date: string | null;
  onDateChange: (val: string) => void;
  user: string | null;
  onUserChange: (val: string | null) => void;
  group: string | null;
  onGroupChange: (val: string | null) => void;
  userOptions: { value: string; label: string }[];
  groupOptions: { value: string; label: string }[];
};

export function ConversationFilters({
  date,
  onDateChange,
  user,
  onUserChange,
  group,
  onGroupChange,
  userOptions,
  groupOptions,
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
            value={date}
            onChange={(val) => {
              onDateChange(val);
              setDateOpened(false);
            }}
          />
        </Popover.Dropdown>
      </Popover>
      <Select
        placeholder={t`Group`}
        data={groupOptions}
        value={group}
        onChange={onGroupChange}
        clearable
        searchable
        w={180}
        bdrs="sm"
      />
      <Select
        data={[{ value: "", label: t`All users` }, ...userOptions]}
        value={user ?? ""}
        onChange={(val) => onUserChange(val === "" ? null : val)}
        searchable
        w={180}
        bdrs="sm"
      />
    </Flex>
  );
}
