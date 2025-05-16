import { t } from "ttag";

import { Select } from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

type TableColumnsSelectProps = {
  value: FieldId | undefined;
  columns: Field[];
  onChange: (newValue: FieldId) => void;
};

export const TableColumnsSelect = ({
  value,
  columns,
  onChange,
}: TableColumnsSelectProps) => {
  const options = columns.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  const handleChange = (newValue: string) => {
    const fieldId = parseInt(newValue, 10);
    onChange(fieldId);
  };

  return (
    <Select
      label={t`Pick column`}
      value={String(value)}
      data={options}
      onChange={handleChange}
    />
  );
};
