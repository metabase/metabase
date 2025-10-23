import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TableDataSource } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableDataSource | null;
  onChange: (value: TableDataSource | null) => void;
}

export const DataSourceInput = ({
  comboboxProps,
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={getData(value)}
      label={t`Data source`}
      placeholder={t`Select a data source`}
      value={stringifyValue(value)}
      onChange={(value) => onChange(parseValue(value))}
      {...props}
    />
  );
};

function getData(value: TableDataSource | null) {
  const data = [
    { value: "ingested", label: t`Ingested` },
    { value: "metabase-transformation", label: t`Metabase transformation` },
    { value: "transformation", label: t`Transformation (external)` },
    { value: "source-data", label: t`Source data` },
    { value: "uploaded-data", label: t`Uploaded data` },
  ];

  if (value === null) {
    return [{ value: "null", label: t`Unknown` }, ...data];
  }

  return data;
}

function stringifyValue(value: TableDataSource | null): string {
  return String(value);
}

function parseValue(value: string): TableDataSource | null {
  return value === "null" ? null : (value as TableDataSource);
}
