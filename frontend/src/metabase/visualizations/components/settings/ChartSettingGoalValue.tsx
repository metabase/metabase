import { getUnansweredGoalEntitiesForValues } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";
import { GoalValueInput, StaticGoalValueInput } from "./GoalValueInput";

export type ChartSettingGoalValueProps = {
  id: string;
  value: GoalValue | null | undefined;
  onChange: (value: GoalValue | null | undefined) => void;
  data?: DatasetData;
  datasetQuery?: DatasetQuery;
  // false keeps the plain numeric input of displays that don't resolve references yet
  isDynamic?: boolean;
  placeholder?: string;
  showSelfColumns?: boolean;
};

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
