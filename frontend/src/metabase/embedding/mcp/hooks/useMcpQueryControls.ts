import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";

import { useChartTypes } from "./useChartTypes";
import { useDateFilter } from "./useDateFilter";
import { useTemporalGranularity } from "./useTemporalGranularity";

export function useMcpQueryControls() {
  const { question, updateQuestion, queryResults } = useSdkQuestionContext();

  const {
    sensibleChartTypes,
    hasOnlyTable,
    selectedChartType,
    handleDisplayChange,
  } = useChartTypes(question, queryResults, updateQuestion);

  const {
    temporalColumn,
    rawTemporalColumn,
    currentUnit,
    availableItems,
    bucketLabel,
    handleBucketChange,
  } = useTemporalGranularity(question, updateQuestion);

  const {
    dateFilterClause,
    dateFilterValue,
    dateFilterLabel,
    datePickerUnits,
    handleDateFilterChange,
    handleDateFilterClear,
  } = useDateFilter(question, updateQuestion, rawTemporalColumn);

  const timeRange =
    rawTemporalColumn !== null
      ? {
          label: dateFilterLabel,
          value: dateFilterValue,
          availableUnits: datePickerUnits,
          hasActiveFilter: !!dateFilterClause,
          onChange: handleDateFilterChange,
          onClear: handleDateFilterClear,
        }
      : undefined;

  const timeGranularity =
    temporalColumn !== null && availableItems.length > 0
      ? {
          label: bucketLabel,
          currentUnit,
          availableItems,
          onChange: handleBucketChange,
        }
      : undefined;

  const hasChartTypeSelector =
    !!question &&
    !!queryResults &&
    !hasOnlyTable &&
    sensibleChartTypes.length > 0;

  const hasTimeControls =
    !!question &&
    !!queryResults &&
    !hasOnlyTable &&
    !!(timeRange || timeGranularity);

  return {
    chartTypes: sensibleChartTypes,
    currentChartType: selectedChartType ?? "",
    hasChartTypeSelector,
    hasTimeControls,
    onChartTypeChange: handleDisplayChange,
    timeGranularity,
    timeRange,
  };
}
