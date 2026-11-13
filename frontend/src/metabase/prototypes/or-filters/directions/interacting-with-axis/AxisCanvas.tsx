import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterCanvasProps } from "../../types";
import { QuestionChart } from "../chart-filters/QuestionChart";
import {
  LandedFlash,
  QuestionShell,
  useQuestionHistory,
} from "../chart-filters/QuestionShell";
import { SummaryInBarDataZone } from "../iteration-4-with-add-filter-2/DataViewCanvas";

import { DimensionAxisTitle, MeasureAxisTitle } from "./AxisObjects";

const FOCUS_KEY = "f";

/**
 * "Without AND"'s bar over a chart whose axes answer back: the y-axis title is
 * the measure, the x-axis title the dimension. Each reads as the chart draws
 * it until you point at it.
 */
export function AxisCanvas({
  query,
  onChange,
  heading,
  display = "bar",
}: FilterCanvasProps) {
  const question = useQuestionHistory(query, onChange);
  const isAggregated = Lib.aggregations(query, 0).length > 0;

  return (
    <QuestionShell
      query={query}
      heading={heading}
      canGoBack={question.canGoBack}
      onBack={question.back}
    >
      <Box pos="relative">
        {question.landed != null && (
          <LandedFlash landedKey={question.landedKey} />
        )}
        <SummaryInBarDataZone
          query={query}
          onChange={onChange}
          focusKey={FOCUS_KEY}
        />
      </Box>
      <Box p="lg">
        <QuestionChart
          query={query}
          hasFirstActionDivider
          display={display}
          hasSymbolThresholds
          onPick={question.apply}
          onLegacyDrill={(nextQuery) => question.apply(nextQuery)}
          yAxisTitle={
            isAggregated
              ? (frame) => (
                  <MeasureAxisTitle
                    query={query}
                    frame={frame}
                    onChange={question.apply}
                  />
                )
              : undefined
          }
          xAxisTitle={
            isAggregated
              ? (frame) => (
                  <DimensionAxisTitle
                    query={query}
                    frame={frame}
                    onChange={question.apply}
                  />
                )
              : undefined
          }
        />
      </Box>
    </QuestionShell>
  );
}
