import {
  type ChartSettingGoalValueProps,
  getUnansweredGoalEntitiesForValues,
} from "metabase/viz-core";
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
  const handleChange = (newValue: GoalValue | null) =>
    onChange(newValue ?? undefined);

  if (!isDynamic) {
    return (
      <ChartSettingInputNumeric
        id={id}
        placeholder={placeholder}
        value={isGoalStaticValue(value) ? value : undefined}
        onChange={onChange}
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
