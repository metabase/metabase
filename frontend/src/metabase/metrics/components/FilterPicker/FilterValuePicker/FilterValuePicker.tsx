import { skipToken } from "@reduxjs/toolkit/query/react";
import { useMemo } from "react";

import {
  useGetMeasureDimensionValuesQuery,
  useGetMetricDimensionValuesQuery,
  useGetRemappedMeasureDimensionValueQuery,
  useGetRemappedMetricDimensionValueQuery,
  useSearchMeasureDimensionValuesQuery,
  useSearchMetricDimensionValuesQuery,
} from "metabase/api";
import { parseNumber } from "metabase/lib/number";
import {
  FieldValuePicker,
  type UseGetFieldValuesArgs,
  type UseGetFieldValuesResult,
  type UseGetRemappedFieldValueArgs,
  type UseGetRemappedFieldValueResult,
  type UseSearchFieldValuesArgs,
  type UseSearchFieldValuesResult,
} from "metabase/querying/common/components/FieldValuePicker";
import type { ComboboxProps } from "metabase/ui";
import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { getStaticPlaceholder } from "./utils";

type FilterValuePickerProps<T> = {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  values: T[];
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  onChange: (newValues: T[]) => void;
};

type FilterValuePickerOwnProps = {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  values: string[];
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
};

function FilterValuePicker({
  definition,
  dimension,
  values,
  autoFocus,
  comboboxProps,
  parseValue,
  onChange,
}: FilterValuePickerOwnProps) {
  const metricId = LibMetric.sourceMetricId(definition);
  const measureId = LibMetric.sourceMeasureId(definition);

  const dimensionInfo = useMemo(
    () => LibMetric.dimensionValuesInfo(definition, dimension),
    [definition, dimension],
  );

  const { canListValues, canSearchValues, canRemapValues } = dimensionInfo;

  const useGetFieldValues = ({
    skip,
  }: UseGetFieldValuesArgs): UseGetFieldValuesResult => {
    const metricResult = useGetMetricDimensionValuesQuery(
      metricId == null || skip
        ? skipToken
        : { metricId, dimensionId: dimensionInfo.id },
    );

    const measureResult = useGetMeasureDimensionValuesQuery(
      measureId == null || metricId != null || skip
        ? skipToken
        : { measureId, dimensionId: dimensionInfo.id },
    );

    return metricId != null ? metricResult : measureResult;
  };

  const useSearchFieldValues = ({
    value,
    limit,
    skip,
  }: UseSearchFieldValuesArgs): UseSearchFieldValuesResult => {
    const metricResult = useSearchMetricDimensionValuesQuery(
      metricId == null || skip
        ? skipToken
        : { metricId, dimensionId: dimensionInfo.id, query: value, limit },
    );

    const measureResult = useSearchMeasureDimensionValuesQuery(
      measureId == null || metricId != null || skip
        ? skipToken
        : { measureId, dimensionId: dimensionInfo.id, query: value, limit },
    );

    return metricId != null ? metricResult : measureResult;
  };

  const useGetRemappedFieldValue = ({
    value,
    skip,
  }: UseGetRemappedFieldValueArgs): UseGetRemappedFieldValueResult => {
    const metricResult = useGetRemappedMetricDimensionValueQuery(
      metricId == null || skip
        ? skipToken
        : { metricId, dimensionId: dimensionInfo.id, value },
    );

    const measureResult = useGetRemappedMeasureDimensionValueQuery(
      measureId == null || metricId != null || skip
        ? skipToken
        : { measureId, dimensionId: dimensionInfo.id, value },
    );

    return metricId != null ? metricResult : measureResult;
  };

  return (
    <FieldValuePicker
      values={values}
      placeholder={getStaticPlaceholder(dimension)}
      autoFocus={autoFocus}
      canListValues={canListValues}
      canSearchValues={canSearchValues}
      canRemapValues={canRemapValues}
      comboboxProps={comboboxProps}
      parseValue={parseValue}
      useGetFieldValues={useGetFieldValues}
      useSearchFieldValues={useSearchFieldValues}
      useGetRemappedFieldValue={useGetRemappedFieldValue}
      onChange={onChange}
    />
  );
}

type StringFilterValuePickerProps = FilterValuePickerProps<string>;

export function StringFilterValuePicker(props: StringFilterValuePickerProps) {
  return <FilterValuePicker {...props} />;
}

type NumberFilterValuePickerProps =
  FilterValuePickerProps<Lib.NumberFilterValue>;

export function NumberFilterValuePicker({
  values,
  onChange,
  ...props
}: NumberFilterValuePickerProps) {
  const parseValue = (rawValue: string) => {
    const number = parseNumber(rawValue);
    return number != null ? String(number) : null;
  };

  const handleChange = (newValues: string[]) => {
    onChange(newValues.map(parseNumber).filter((value) => value != null));
  };

  return (
    <FilterValuePicker
      {...props}
      values={values.map(String)}
      parseValue={parseValue}
      onChange={handleChange}
    />
  );
}
