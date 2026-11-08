import type { ReactNode } from "react";

import { Skeleton } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ConcreteTableId, Dataset, RawSeries } from "metabase-types/api";

import { ChartDetail, ResultTable, ValuesRow } from "./ChartDetail";
import S from "./TableFlow.module.css";
import { XrayChartDetail } from "./XrayChartDetail";
import { XrayGallery } from "./XrayGallery";
import { useSelectedXrayChart } from "./use-xray-selection";
import { hasUngroupedValues, isSummarized } from "./utils";

type TableFlowProps = {
  /** The query builder's question. */
  question: Question;
  onQuestionChange: (question: Question) => void;
  /** Source table of the question; the gallery is unavailable without one. */
  tableId: ConcreteTableId | null;
  isGalleryOpen: boolean;
  /** Height of the scrollable area the flow is laid out in. */
  viewportHeight: number;
  /** The question's results, shown as the gallery's raw records card and below its chart. */
  rawSeries: RawSeries | null;
  /** The question's full results, for visualization suggestions and settings. */
  result: Dataset | null;
  /** `null` hides the search bar. */
  searchText: string | null;
  onSearchTextChange: (searchText: string) => void;
  /** The question's own visualization, shown in the inset card. */
  children: ReactNode;
};

const TABULAR_DISPLAYS = ["table", "object"];

/**
 * Lays out the query builder's view as inset cards: an optional strip of the
 * source table's raw records and x-ray charts, then the selected x-ray chart above
 * its data, or else the question itself — a table with an attached search bar, or
 * a chart above its data, editable like an x-ray chart. The x-ray selection lives
 * in the URL and outlasts closing the gallery.
 */
export function TableFlow({
  question,
  onQuestionChange,
  tableId,
  isGalleryOpen,
  viewportHeight,
  rawSeries,
  result,
  searchText,
  onSearchTextChange,
  children,
}: TableFlowProps) {
  const {
    charts,
    hasError,
    selectedPosition,
    onSelectPosition,
    selectedChart,
    selectedCard,
    onSelectedCardChange,
    isSelectedChartLoading,
  } = useSelectedXrayChart(tableId, isGalleryOpen);

  // a summary always gets its chart: several ungrouped values default to a table display
  const isChart =
    isSummarized(question) || !TABULAR_DISPLAYS.includes(question.display());

  return (
    // fills the visible area, so the chart and table split the screen instead of scrolling
    <div
      className={S.root}
      style={{ height: `max(30rem, ${viewportHeight}px)` }}
    >
      {isGalleryOpen && tableId != null && (
        <XrayGallery
          charts={charts}
          hasError={hasError}
          rawSeries={rawSeries}
          selectedPosition={selectedChart ? selectedPosition : null}
          onSelectPosition={onSelectPosition}
        />
      )}
      {selectedChart && selectedCard ? (
        <XrayChartDetail
          key={selectedChart.id}
          chart={selectedChart}
          card={selectedCard}
          onCardChange={onSelectedCardChange}
        />
      ) : isSelectedChartLoading ? (
        <Skeleton className={S.card} h={400} />
      ) : (
        // one element for both shapes, so the side panel stays open when a summary turns the table into a chart
        <ChartDetail
          question={question}
          result={result}
          chart={
            !isChart ? null : hasUngroupedValues(question) ? (
              <ValuesRow rawSeries={rawSeries} />
            ) : (
              children
            )
          }
          table={
            isChart ? (
              <ResultTable
                question={question}
                rawSeries={rawSeries}
                error={null}
                onQuestionChange={onQuestionChange}
              />
            ) : (
              children
            )
          }
          search={
            !isChart && searchText != null
              ? { text: searchText, onChange: onSearchTextChange }
              : undefined
          }
          isMetadataReady
          onQuestionChange={onQuestionChange}
        />
      )}
    </div>
  );
}
