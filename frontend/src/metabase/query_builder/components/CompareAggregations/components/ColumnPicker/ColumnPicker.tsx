import { useCallback } from "react";
import { t } from "ttag";

import { MultiAutocomplete } from "metabase/ui";

import type { ColumnType } from "../../types";

interface Props {
  value: ColumnType[];
  onChange: (value: ColumnType[]) => void;
}

const COLUMN_OPTIONS: { label: string; value: ColumnType }[] = [
  { label: t`Previous value`, value: "offset" },
  { label: t`Percentage difference`, value: "percent-diff-offset" },
  { label: t`Value difference`, value: "diff-offset" },
];

export const ColumnPicker = ({ value, onChange }: Props) => {
  const handleChange = useCallback(
    (values: string[]) => {
      onChange(values as ColumnType[]);
    },
    [onChange],
  );

  return (
    <MultiAutocomplete
      label={t`Columns to create`}
      data={COLUMN_OPTIONS}
      placeholder={t`Columns to create`}
      rightSection={null}
      shouldCreate={shouldCreate}
      value={value}
      onChange={handleChange}
    />
  );
};

const shouldCreate = () => false;
