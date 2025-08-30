import { useMemo } from "react";
import { t } from "ttag";

import { NumberInput, SegmentedControl, Select, Stack } from "metabase/ui";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

interface ChartSettingGoalInputProps {
  id: string;
  value: number | string;
  onChange: (value: number | string) => void;
  columns?: any[];
  valueField?: string;
}

export const ChartSettingGoalInput = ({
  id,
  value,
  onChange,
  columns = [],
  valueField,
}: ChartSettingGoalInputProps) => {
  const numericColumns = useMemo(() => {
    if (!columns?.length) {
      return [];
    }
    return columns
      .filter(isNumeric)
      .filter((col) => col.name !== valueField) // Exclude the value field
      .map((col) => ({
        value: col.name,
        label: col.display_name || col.name,
      }));
  }, [columns, valueField]);

  const isColumnReference =
    typeof value === "string" &&
    numericColumns.some((col) => col.value === value);
  const currentMode = isColumnReference ? "column" : "fixed";
  const numericValue = typeof value === "number" ? value : 0;

  const hasNumericColumns = numericColumns.length > 0;

  return (
    <Stack gap="sm">
      {hasNumericColumns && (
        <SegmentedControl
          value={currentMode}
          onChange={(mode) => {
            if (mode === "fixed") {
              onChange(numericValue);
            } else if (mode === "column" && numericColumns.length > 0) {
              onChange(numericColumns[0].value);
            }
          }}
          data={[
            { label: t`Fixed value`, value: "fixed" },
            { label: t`Column`, value: "column" },
          ]}
        />
      )}

      {currentMode === "fixed" && (
        <NumberInput
          id={`${id}-value`}
          value={numericValue}
          onChange={(val) => onChange(val ?? 0)}
          placeholder={t`Enter goal value`}
        />
      )}

      {currentMode === "column" && hasNumericColumns && (
        <Select
          id={`${id}-column`}
          data={numericColumns}
          value={isColumnReference ? value : null}
          onChange={(selectedColumn) => {
            if (selectedColumn) {
              onChange(selectedColumn);
            }
          }}
          placeholder={t`Select column`}
          searchable
        />
      )}

      {currentMode === "column" && !hasNumericColumns && (
        <Select
          id={`${id}-column`}
          data={[]}
          value={null}
          disabled
          placeholder={t`No other numeric columns available`}
        />
      )}
    </Stack>
  );
};
