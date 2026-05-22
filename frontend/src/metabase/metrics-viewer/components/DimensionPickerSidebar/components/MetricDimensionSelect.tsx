import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { DimensionPickerSidebarCategorySelectRow } from "metabase/metrics-viewer/utils";
import { Select } from "metabase/ui";

import S from "./MetricDimensionSelect.module.css";

export function MetricDimensionSelect({
  row,
  onChange,
}: {
  row: DimensionPickerSidebarCategorySelectRow;
  onChange: (dimensionId: string) => void;
}) {
  return (
    <Select
      classNames={{ input: S.metricSelectInput }}
      aria-label={t`Select dimension for ${row.metricName}`}
      data={row.options}
      value={row.value}
      searchable
      nothingFoundMessage={t`No fields found`}
      leftSection={
        <SourceColorIndicator
          colors={row.colors}
          fallbackIcon="metric"
          size={14}
        />
      }
      size="sm"
      onChange={(value) => {
        if (value) {
          onChange(value);
        }
      }}
    />
  );
}
