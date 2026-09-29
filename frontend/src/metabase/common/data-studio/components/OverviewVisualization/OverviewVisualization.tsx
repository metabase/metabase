import { useCallback, useMemo } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { useQuestionFromCard } from "metabase/metadata-store";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { useDispatch } from "metabase/redux";
import { openUrl } from "metabase/redux/app";
import * as Urls from "metabase/urls";
import { getCardAfterVisualizationClick } from "metabase/viz-core";
import type { Card, Dataset, SeriesCard } from "metabase-types/api";

import { useCardQueryData } from "../../hooks/use-card-query-data";

import S from "./OverviewVisualization.module.css";

type MetricCardVisualizationProps = {
  card: Card;
  data: Dataset | undefined;
  isLoading: boolean;
  className?: string;
};

export function MetricCardVisualization({
  card,
  data,
  isLoading,
  className,
}: MetricCardVisualizationProps) {
  const dispatch = useDispatch();
  const question = useQuestionFromCard(card);

  const rawSeries = useMemo(
    () => (data ? [{ card, data: data.data }] : null),
    [card, data],
  );

  // This page has no editor to drill inside of, so a drill leaves for the
  // drilled question, ad hoc, the same way the query builder navigates.
  const navigateToNewCard = useCallback(
    ({
      nextCard,
      previousCard,
    }: {
      nextCard: SeriesCard;
      previousCard: SeriesCard;
    }) => {
      const cardAfterClick = getCardAfterVisualizationClick(
        nextCard,
        previousCard,
      );
      dispatch(openUrl(Urls.serializedQuestion(cardAfterClick)));
    },
    [dispatch],
  );

  return (
    <DebouncedFrame className={S.root}>
      <QueryVisualization
        className={className ?? S.visualization}
        question={question}
        result={data}
        rawSeries={rawSeries}
        queryBuilderMode="dataset"
        isRunnable={false}
        isRunning={isLoading}
        isDirty
        isResultDirty={false}
        navigateToNewCardInsideQB={navigateToNewCard}
      />
    </DebouncedFrame>
  );
}

type OverviewVisualizationProps = {
  card: Card;
};

export function OverviewVisualization({ card }: OverviewVisualizationProps) {
  const { data, isLoading } = useCardQueryData(card);

  return (
    <MetricCardVisualization card={card} data={data} isLoading={isLoading} />
  );
}
