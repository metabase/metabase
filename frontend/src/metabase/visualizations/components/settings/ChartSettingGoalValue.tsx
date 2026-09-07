import {
  type ChartSettingGoalValueProps,
  getUnansweredGoalEntitiesForValues,
} from "metabase/viz-core";
import type { GoalValue } from "metabase-types/api";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";
import { GoalValueInput, StaticGoalValueInput } from "./GoalValueInput";

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
  const handleChange = (newValue: GoalValue | null) =>
    onChange(newValue ?? undefined);

  if (!isDynamic) {
    return (
      <ChartSettingInputNumeric
        id={id}
        placeholder={placeholder}
        value={typeof value === "number" ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (data == null) {
    return (
      <StaticGoalValueInput
        id={id}
        placeholder={placeholder}
        value={value ?? null}
        onChange={handleChange}
      />
    );
  }

  return (
    <GoalValueInput
      data={data}
      datasetQuery={datasetQuery}
      id={id}
      placeholder={placeholder}
      referencedEntities={getUnansweredGoalEntitiesForValues(data, [value])}
      showSelfColumns={showSelfColumns}
      value={value ?? null}
      onChange={handleChange}
    />
  );
};
