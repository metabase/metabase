import { useGetAdhocQueryMetadataQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import {
  ChartDetail,
  ResultTable,
  SeriesVisualization,
  ValuesRow,
} from "./ChartDetail";
import { useCardSeries } from "./XrayGallery";
import { type XrayChart, hasUngroupedValues } from "./utils";

type XrayChartDetailProps = {
  chart: XrayChart;
  /** The chart's card including any edits. */
  card: Card;
  /** CSS height of the data table card and the side panel. */
  tableHeight: string;
  onCardChange: (card: Card) => void;
};

/** An x-ray chart above its data; every edit and drill replaces the chart's card. */
export function XrayChartDetail({
  chart,
  card,
  tableHeight,
  onCardChange,
}: XrayChartDetailProps) {
  // loads the columns and metrics of every table the chart touches, so the editors can offer them
  const { isFetching: isMetadataFetching } = useGetAdhocQueryMetadataQuery(
    chart.card.dataset_query,
  );
  const question = useQuestionFromCard(card);
  const { rawSeries, dataset, error } = useCardSeries(card);

  const handleQuestionChange = (nextQuestion: Question) =>
    onCardChange(nextQuestion.card());

  return (
    <ChartDetail
      question={question}
      result={dataset}
      tableHeight={tableHeight}
      isMetadataReady={!isMetadataFetching}
      onQuestionChange={handleQuestionChange}
      chart={
        hasUngroupedValues(question) ? (
          <ValuesRow rawSeries={rawSeries} />
        ) : (
          <SeriesVisualization
            rawSeries={rawSeries}
            error={error}
            // drills stay in this view: they replace the chart's card instead of navigating away
            onDrill={(nextCard) => onCardChange({ ...card, ...nextCard })}
          />
        )
      }
      table={
        <ResultTable
          question={question}
          rawSeries={rawSeries}
          error={error}
          onQuestionChange={handleQuestionChange}
        />
      }
    />
  );
}
