import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import {
  type McpChartTypeEntry,
  getMcpChartTypes,
} from "../utils/getMcpChartTypes";

interface UseChartTypesInput {
  queryKey: string | null;
  question: Question | undefined;
  queryResults: Dataset[] | null | undefined;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
}

interface UseChartTypesResult {
  sensibleChartTypes: McpChartTypeEntry[];
  hasOnlyTable: boolean;
  selectedChartType: CardDisplayType | null;
  handleDisplayChange: (type: CardDisplayType) => void;
}

export function useChartTypes({
  queryKey,
  question,
  queryResults,
  updateQuestion,
}: UseChartTypesInput): UseChartTypesResult {
  const queryResult = queryResults?.[0] ?? null;
  const currentDisplay = question?.display() ?? null;

  const originalDisplayRef = useRef<{
    queryKey: string | null;
    display: CardDisplayType | null;
  }>({ queryKey, display: null });

  // Clear the original visualization when the query changes
  if (originalDisplayRef.current.queryKey !== queryKey) {
    originalDisplayRef.current = { display: null, queryKey };
  }

  const originalDisplay = originalDisplayRef.current.display;

  // EMB-1858: MCP cards start as `table` before the SDK picks a sensible viz.
  // Update that placeholder, then preserve the visualization across re-runs.
  const shouldUpdateOriginalDisplay =
    queryResult !== null &&
    currentDisplay !== null &&
    (originalDisplay === null ||
      (originalDisplay === "table" && currentDisplay !== "table"));

  if (shouldUpdateOriginalDisplay) {
    originalDisplayRef.current.display = currentDisplay;
  }

  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResult }),
    [queryResult],
  );

  const rowCount = queryResult?.data?.rows?.length ?? 0;

  const sensibleChartTypes = getMcpChartTypes({
    defaultDisplay: originalDisplayRef.current.display,
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    canShowTable: rowCount >= 2,
  });

  const hasOnlyTable =
    sensibleChartTypes.length === 1 && sensibleChartTypes[0].type === "table";

  const handleDisplayChange = (type: CardDisplayType) => {
    if (!question) {
      return;
    }

    const nextQuestion = question.setDisplay(type).lockDisplay();

    updateQuestion(nextQuestion, { run: false });
  };

  return {
    sensibleChartTypes,
    hasOnlyTable,
    selectedChartType: currentDisplay,
    handleDisplayChange,
  };
}
