import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import {
  type McpChartTypeEntry,
  getMcpChartTypes,
} from "../utils/getMcpChartTypes";

interface UseChartTypesResult {
  sensibleChartTypes: McpChartTypeEntry[];
  hasOnlyTable: boolean;
  selectedChartType: CardDisplayType | null;
  handleDisplayChange: (type: CardDisplayType) => void;
}

export function useChartTypes(
  question: Question | undefined,
  queryResults: Dataset[] | null | undefined,
  updateQuestion: (question: Question, opts: { run: boolean }) => void,
): UseChartTypesResult {
  const queryResult = queryResults?.[0] ?? null;
  const currentDisplay = question?.display() ?? null;

  const defaultDisplayRef = useRef<CardDisplayType | null>(null);

  if (
    queryResult &&
    currentDisplay != null &&
    (defaultDisplayRef.current == null ||
      (defaultDisplayRef.current === "table" && currentDisplay !== "table"))
  ) {
    defaultDisplayRef.current = currentDisplay;
  }

  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResult }),
    [queryResult],
  );

  const rowCount = queryResult?.data?.rows?.length ?? 0;

  const sensibleChartTypes = getMcpChartTypes({
    defaultDisplay: defaultDisplayRef.current,
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
