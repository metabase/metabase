import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";

import { useDateFilter } from "./useDateFilter";
import { useMcpVisualizationSelector } from "./useMcpVisualizationSelector";
import { useTemporalGranularity } from "./useTemporalGranularity";

export function useMcpQueryControls(queryKey: string | null) {
  const { question, updateQuestion, queryResults } = useSdkQuestionContext();

  const { sensibleChartTypes, selectedChartType, handleDisplayChange } =
    useMcpVisualizationSelector({
      question,
      queryResults,
      updateQuestion,
      queryKey,
    });

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

  const hasQueryResults = !!question && !!queryResults;

  const hasChartTypeSelector = hasQueryResults && sensibleChartTypes.length > 1;

  const hasTimeControls = hasQueryResults && !!(timeRange || timeGranularity);

  return {
    chartTypes: sensibleChartTypes,
    currentChartType: selectedChartType,
    hasChartTypeSelector,
    hasTimeControls,
    onChartTypeChange: handleDisplayChange,
    timeGranularity,
    timeRange,
  };
}
