import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { DimensionPickerSidebarCategorySelectRow } from "metabase/metrics-viewer/utils";
import { Badge, Flex, Select, Text } from "metabase/ui";

import S from "./MetricDimensionSelect.module.css";

export function MetricDimensionSelect({
  row,
  onChange,
}: {
  row: DimensionPickerSidebarCategorySelectRow;
  onChange: (dimensionId: string) => void;
}) {
  const showOccurrenceCount =
    row.occurrenceCount != null && row.occurrenceCount > 1;

  return (
    <Select
      label={
        <Flex align="center" gap="xs" miw={0} pt="0.5rem">
          <Text fz="md" lh="md" component="span">
            {row.metricName}
          </Text>
          {showOccurrenceCount && (
            <Badge circle c="text-brand-hover">
              {row.occurrenceCount}
            </Badge>
          )}
        </Flex>
      }
      classNames={{ input: S.metricSelectInput }}
      aria-label={t`Select dimension for ${row.metricName}`}
      data={row.options}
      value={row.value}
      searchable
      nothingFoundMessage={t`No fields found`}
      leftSection={
        <SourceColorIndicator
          colors={row.colors}
          fallbackIcon={row.isExpressionToken ? undefined : "metric"}
          size={14}
        />
      }
      placeholder={t`Select a dimension`}
      size="sm"
      onChange={(value) => {
        if (value) {
          onChange(value);
        }
      }}
    />
  );
}
