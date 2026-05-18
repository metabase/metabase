import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";

import { QueryExplorerBar } from "./QueryExplorerBar";
import { useChartTypes } from "./hooks/useChartTypes";
import { useDateFilter } from "./hooks/useDateFilter";
import { useTemporalGranularity } from "./hooks/useTemporalGranularity";

export function McpQueryBar() {
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

  if (!question || !queryResults || hasOnlyTable) {
    return null;
  }

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

  const hasControls =
    sensibleChartTypes.length > 0 || timeRange || timeGranularity;

  if (!hasControls) {
    return null;
  }

  return (
    <QueryExplorerBar
      chartTypes={sensibleChartTypes}
      currentChartType={selectedChartType ?? ""}
      onChartTypeChange={handleDisplayChange}
      timeRange={timeRange}
      timeGranularity={timeGranularity}
    />
  );
}
