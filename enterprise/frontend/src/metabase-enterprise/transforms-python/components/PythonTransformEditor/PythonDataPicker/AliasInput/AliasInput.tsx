import { useEffect, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, TextInput } from "metabase/ui";
import type { Table } from "metabase-types/api";

import type { TableSelection } from "../types";
import { slugify } from "../utils";

export function AliasInput({
  table,
  selection,
  onChange,
  usedAliases,
  disabled,
}: {
  selection: TableSelection;
  table?: Table;
  onChange: (value: string) => void;
  usedAliases: Set<string>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(selection.alias);

  useEffect(() => {
    setValue(selection.alias);
  }, [selection.alias]);

  const defaultAlias = table
    ? slugify(table.name, usedAliases, selection.alias)
    : "";
  const isManualAlias = selection.alias !== defaultAlias;
  const showReset = table && isManualAlias;

  function handleChange(evt: React.ChangeEvent<HTMLInputElement>) {
    setValue(evt.target.value);
  }

  function handleBlur() {
    onChange(value);
  }

  return (
    <TextInput
      w="100%"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={t`Enter alias`}
      disabled={disabled}
      rightSection={
        showReset && (
          <ActionIcon
            onClick={() => onChange(defaultAlias)}
            aria-label={t`Reset alias to default`}
            color="text-tertiary"
            variant="subtle"
          >
            <Icon name="refresh" size={12} />
          </ActionIcon>
        )
      }
    />
  );
}
