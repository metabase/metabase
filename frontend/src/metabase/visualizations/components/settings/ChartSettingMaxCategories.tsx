import { useCallback } from "react";
import { t } from "ttag";

import { Checkbox, Select, Stack, Text } from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";
import type { ChartSettingWidgetProps } from "./types";

type AggregationFunction = Exclude<
  VisualizationSettings["graph.other_category_aggregation_fn"],
  undefined
>;

export interface ChartSettingMaxCategoriesProps
  extends ChartSettingWidgetProps<number> {
  isEnabled?: boolean;
  aggregationFunction: AggregationFunction;
}

export const ChartSettingMaxCategories = ({
  isEnabled,
  aggregationFunction,
  ...props
}: ChartSettingMaxCategoriesProps) => {
  const { onChangeSettings } = props;

  const handleToggleMaxNumberOfSeries = useCallback(
    (value: boolean) => {
      onChangeSettings({ "graph.max_categories_enabled": value });
    },
    [onChangeSettings],
  );

  const handleAggregationFunctionChange = useCallback(
    (value: string | null) => {
      if (value) {
        onChangeSettings({
          "graph.other_category_aggregation_fn": value as AggregationFunction,
        });
      }
    },
    [onChangeSettings],
  );

  return (
    <Stack spacing="md">
      <Checkbox
        checked={isEnabled}
        label={t`Enforce maximum number of series`}
        onChange={e => handleToggleMaxNumberOfSeries(e.target.checked)}
      />
      <ChartSettingInputNumeric
        {...props}
        data-testid="graph-max-categories-input"
      />
      <Text>{t`Series after this number will be grouped into "Other"`}</Text>
      <div>
        <Text
          component="label"
          htmlFor="aggregationFunction"
          color="var(--mb-color-text-dark)"
          fz="sm"
          mb="sm"
        >{t`Aggregation method for Other group`}</Text>
        <Select
          name="aggregationFunction"
          value={aggregationFunction}
          data={AGGREGATION_FN_OPTIONS}
          onChange={handleAggregationFunctionChange}
          data-testid="graph-other-category-aggregation-fn-picker"
          zIndex={401}
        />
      </div>
    </Stack>
  );
};

const AGGREGATION_FN_OPTIONS = [
  { label: t`Sum`, value: "sum" },
  { label: t`Average`, value: "avg" },
  { label: t`Median`, value: "median" },
  { label: t`Standard deviation`, value: "stddev" },
  { label: t`Min`, value: "min" },
  { label: t`Max`, value: "max" },
];
