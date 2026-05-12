import { useMemo } from "react";
import { t } from "ttag";

import { Select } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

export type DatabaseSelectProps = {
  databases: Database[];
  value: DatabaseId | null;
  disabled?: boolean;
  onChange: (databaseId: DatabaseId | null) => void;
};

export function DatabaseSelect({
  databases,
  value,
  disabled,
  onChange,
}: DatabaseSelectProps) {
  const data = useMemo(
    () =>
      databases.map((database) => ({
        value: String(database.id),
        label: database.name,
      })),
    [databases],
  );

  return (
    <Select
      label={t`Database`}
      placeholder={t`Pick database`}
      data={data}
      value={value != null ? String(value) : null}
      disabled={disabled}
      onChange={(newValue) =>
        onChange(newValue != null ? Number(newValue) : null)
      }
    />
  );
}
