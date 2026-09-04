import {
  type ChartSettingGoalValueProps,
  getUnansweredGoalEntitiesForValues,
} from "metabase/viz-core";

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
      onChange={onChange}
    />
  );
};
