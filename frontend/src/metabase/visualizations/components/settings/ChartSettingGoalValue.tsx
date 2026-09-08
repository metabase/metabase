import type { ChartSettingGoalValueProps } from "metabase/viz-core";
import type { GoalValue } from "metabase-types/api";
import { isGoalStaticValue } from "metabase-types/guards";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";
import { GoalValueInput } from "./GoalValueInput";

export const ChartSettingGoalValue = ({
  id,
  value,
  onChange,
  data,
  datasetQuery,
  isDynamic = false,
  placeholder,
  showSelfColumns = true,
}: ChartSettingGoalValueProps) => {
  // Clearing unsets the goal so the default applies, like the numeric input does.
  const handleChange = (newValue: GoalValue | null | undefined) =>
    onChange(newValue ?? undefined);

  if (!isDynamic) {
    // The numeric input shows a reference as empty, so its blur must not erase it.
    const hasReference = value != null && !isGoalStaticValue(value);
    const handleNumericChange = (newValue: number | null | undefined) => {
      if (newValue == null && hasReference) {
        return;
      }
      handleChange(newValue);
    };

    return (
      <ChartSettingInputNumeric
        id={id}
        placeholder={placeholder}
        value={isGoalStaticValue(value) ? value : undefined}
        onChange={handleNumericChange}
      />
    );
  }

  return (
    <GoalValueInput
      data={data}
      datasetQuery={datasetQuery}
      id={id}
      placeholder={placeholder}
      showSelfColumns={showSelfColumns}
      value={value ?? null}
      onChange={handleChange}
    />
  );
};
