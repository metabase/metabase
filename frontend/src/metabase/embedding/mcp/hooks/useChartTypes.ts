import { useMemo } from "react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

const CHART_TYPES = [
  { type: "line" as const, icon: "line" as const },
  { type: "bar" as const, icon: "bar" as const },
  { type: "area" as const, icon: "area" as const },
];

const TABLE_CHART_TYPE = { type: "table" as const, icon: "table2" as const };

export type McpChartType = "line" | "bar" | "area" | "table";

const isMcpChartType = (type: string): type is McpChartType =>
  [...CHART_TYPES, TABLE_CHART_TYPE].some(
    (chartType) => chartType.type === type,
  );

type UpdateQuestion = (question: Question, opts: { run: boolean }) => void;

type ChartTypeEntry = (typeof CHART_TYPES)[number] | typeof TABLE_CHART_TYPE;

interface UseChartTypesResult {
  sensibleChartTypes: ChartTypeEntry[];
  hasOnlyTable: boolean;
  selectedChartType: McpChartType | null;
  handleDisplayChange: (type: string) => void;
}

export function useChartTypes(
  question: Question | undefined,
  queryResults: Dataset[] | null | undefined,
  updateQuestion: UpdateQuestion,
): UseChartTypesResult {
  const queryResult = queryResults?.[0] ?? null;

  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResult }),
    [queryResult],
  );

  const rowCount = queryResult?.data?.rows?.length ?? 0;
  const tableVisible = rowCount >= 2;

  const sensibleChartTypes = [
    ...CHART_TYPES.filter(({ type }) => {
      if (!sensibleVisualizations.includes(type)) {
        return false;
      }

      // Hide area when table is shown as they occupy the same slot.
      if (type === "area" && tableVisible) {
        return false;
      }

      return true;
    }),

    ...(tableVisible ? [TABLE_CHART_TYPE] : []),
  ];

  const hasOnlyTable =
    sensibleChartTypes.length === 1 && sensibleChartTypes[0].type === "table";

  const rawDisplay = question?.display() ?? "";

  const selectedChartType: McpChartType | null = isMcpChartType(rawDisplay)
    ? rawDisplay
    : null;

  const handleDisplayChange = (type: string) => {
    if (!question) {
      return;
    }

    const nextQuestion = question
      .setDisplay(type as McpChartType)
      .lockDisplay();

    updateQuestion(nextQuestion, { run: false });
  };

  return {
    sensibleChartTypes,
    hasOnlyTable,
    selectedChartType,
    handleDisplayChange,
  };
}
