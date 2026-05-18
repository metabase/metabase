import { useEffect } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";

import { QueryExplorerBar } from "./QueryExplorerBar";
import { useChartTypes } from "./hooks/useChartTypes";
import { useDateFilter } from "./hooks/useDateFilter";
import { useTemporalGranularity } from "./hooks/useTemporalGranularity";

interface McpQueryBarProps {
  onVisibilityChange?: (isVisible: boolean) => void;
}

export function McpQueryBar({ onVisibilityChange }: McpQueryBarProps) {
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

  const hasControls = Boolean(
    sensibleChartTypes.length > 0 || timeRange || timeGranularity,
  );

  const isVisible =
    !!question && !!queryResults && !hasOnlyTable && hasControls;

  useEffect(() => {
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);

  if (!isVisible) {
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
