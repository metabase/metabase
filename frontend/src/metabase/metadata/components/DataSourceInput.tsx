import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TableDataSource } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  showMetabaseTransform?: boolean;
  value: TableDataSource | "unknown" | null;
  onChange: (value: TableDataSource | "unknown" | null) => void;
}

export const DataSourceInput = ({
  comboboxProps,
  showMetabaseTransform,
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
      data={getData(showMetabaseTransform || value === "metabase-transform")}
      label={t`Source`}
      placeholder={t`Select a data source`}
      value={value}
      onChange={(value) => onChange(value)}
      {...props}
    />
  );
};

function getData(showMetabaseTransform?: boolean) {
  return [
    { value: "unknown" as const, label: t`Unspecified` },
    { value: "ingested" as const, label: t`Ingested` },
    showMetabaseTransform
      ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- shown in Data Studio only
        { value: "metabase-transform" as const, label: t`Metabase transform` }
      : undefined,
    { value: "transform" as const, label: t`Transform` },
    { value: "source-data" as const, label: t`Source data` },
    { value: "upload" as const, label: t`Uploaded data` },
  ].filter((option) => option != null);
}
