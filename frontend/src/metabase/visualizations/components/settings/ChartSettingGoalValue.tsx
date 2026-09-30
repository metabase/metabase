import type { ChartSettingGoalValueProps } from "metabase/viz-core";
import type { GoalValue } from "metabase-types/api";

import { GoalValueInput } from "./GoalValueInput";

export const ChartSettingGoalValue = ({
  data,
  datasetQuery,
  excludedSelfColumn,
  id,
  placeholder,
  showSelfColumns = true,
  value,
  onChange,
}: ChartSettingGoalValueProps) => {
  const handleChange = (newValue: GoalValue | null | undefined) => {
    // Clearing unsets the goal so the default applies, like in ChartSettingInputNumeric
    onChange(newValue ?? undefined);
  };

  return (
    <GoalValueInput
      data={data}
      datasetQuery={datasetQuery}
      excludedSelfColumn={excludedSelfColumn}
      id={id}
      placeholder={placeholder}
      showSelfColumns={showSelfColumns}
      value={value ?? null}
      onChange={handleChange}
    />
  );
};
