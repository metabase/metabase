import { useEffect, useMemo, useRef } from "react";

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
import { getRequestedDisplayAction } from "../utils/getRequestedDisplayAction";

interface UseMcpVisualizationSelectorInput {
  queryKey: string | null;
  question: Question | undefined;
  queryResults: Dataset[] | null | undefined;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;

  /** Chart type `visualize_query` asked for, honored once per query. */
  requestedDisplay?: CardDisplayType | null;
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
  requestedDisplay = null,
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

  const hasSettledResults = defaultDisplayState.queryKey === queryKey;

  const sensibleChartTypes = getMcpChartTypes({
    defaultDisplay: defaultDisplayState.defaultDisplay,
    // Unjustified type cast. FIXME
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    canShowTable: rowCount >= 2,
    // Only the chart type the tool asked for, and only once this query's own
    // results have settled — offering `currentDisplay` outright would leak the
    // previous query's display into the picker on a stale render.
    activeDisplay: hasSettledResults ? requestedDisplay : null,
  });

  const handleDisplayChange = (type: CardDisplayType) => {
    if (!question) {
      return;
    }

    const nextQuestion = question.setDisplay(type).lockDisplay();

    updateQuestion(nextQuestion, { run: false });
  };

  // Honor the tool's requested chart type once this query's results have landed.
  // Locking matches picking from the chart type picker, so the data shape does
  // not reset the display the user explicitly asked for.
  const settledDisplayQueryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const action = getRequestedDisplayAction({
      requestedDisplay,
      currentDisplay,
      defaultDisplay: defaultDisplayState.defaultDisplay,
      queryKey,
      settledQueryKey: settledDisplayQueryKeyRef.current,
    });

    if (action === "wait") {
      return;
    }

    settledDisplayQueryKeyRef.current = queryKey;

    if (action === "apply" && question && requestedDisplay) {
      updateQuestion(question.setDisplay(requestedDisplay).lockDisplay(), {
        run: false,
      });
    }
  }, [
    requestedDisplay,
    currentDisplay,
    defaultDisplayState.defaultDisplay,
    queryKey,
    question,
    updateQuestion,
  ]);

  return {
    sensibleChartTypes,
    selectedChartType: currentDisplay,
    handleDisplayChange,
  };
}
