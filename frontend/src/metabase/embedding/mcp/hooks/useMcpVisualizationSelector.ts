import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import {
  type DefaultDisplayState,
  captureDefaultDisplay,
} from "../utils/captureDefaultDisplay";
import {
  type McpChartTypeEntry,
  getMcpChartTypes,
} from "../utils/getMcpChartTypes";

interface UseMcpVisualizationSelectorInput {
  queryKey: string | null;
  question: Question | undefined;
  queryResults: Dataset[] | null | undefined;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
}

interface UseMcpVisualizationSelectorResult {
  sensibleChartTypes: McpChartTypeEntry[];
  selectedChartType: CardDisplayType | null;
  handleDisplayChange: (type: CardDisplayType) => void;
}

/**
 * Re-builds the chart type picker options for MCP Apps questions.
 *
 * The SDK question can still show the previous query's question and results
 * after the MCP host sends a new query. We track the default display
 * by query key and wait for fresh results before updating it.
 */
export function useMcpVisualizationSelector({
  queryKey,
  question,
  queryResults,
  updateQuestion,
}: UseMcpVisualizationSelectorInput): UseMcpVisualizationSelectorResult {
  const queryResult = queryResults?.[0] ?? null;
  const currentDisplay = question?.display() ?? null;

  const defaultDisplayRef = useRef<DefaultDisplayState>({
    queryKey,
    defaultDisplay: null,
    lastQueryResult: null,
  });

  // Always show the default visualization for a question
  // as the first item in the selector.
  // Every visualization type is possible here.
  const defaultDisplayState = captureDefaultDisplay({
    currentDisplay,
    queryKey,
    queryResult,
    previousState: defaultDisplayRef.current,
  });

  defaultDisplayRef.current = defaultDisplayState;

  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResult }),
    [queryResult],
  );

  const rowCount = queryResult?.data?.rows?.length ?? 0;

  const sensibleChartTypes = getMcpChartTypes({
    defaultDisplay: defaultDisplayState.defaultDisplay,
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    canShowTable: rowCount >= 2,
  });

  const handleDisplayChange = (type: CardDisplayType) => {
    if (!question) {
      return;
    }

    const nextQuestion = question.setDisplay(type).lockDisplay();

    updateQuestion(nextQuestion, { run: false });
  };

  return {
    sensibleChartTypes,
    selectedChartType: currentDisplay,
    handleDisplayChange,
  };
}
