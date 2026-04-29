import { useMemo } from "react";

import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";
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
  [...CHART_TYPES, TABLE_CHART_TYPE].some((c) => c.type === type);

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
  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResults?.[0] ?? null }),
    [queryResults],
  );

  const rowCount = queryResults?.[0]?.data?.rows?.length ?? 0;

  const sensibleChartTypes = [
    // Does not make sense to show table viz if there is just one row.
    ...(rowCount >= 2 ? [TABLE_CHART_TYPE] : []),

    ...CHART_TYPES.filter(({ type }) => sensibleVisualizations.includes(type)),
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
