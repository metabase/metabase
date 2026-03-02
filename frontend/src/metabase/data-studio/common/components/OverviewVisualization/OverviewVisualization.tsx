import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetCardQueryQuery,
} from "metabase/api";
import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { useSelector } from "metabase/lib/redux";
import { QueryVisualization } from "metabase/query_builder/components/QueryVisualization";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./OverviewVisualization.module.css";

type OverviewVisualizationProps = {
  card: Card;
};

export function OverviewVisualization({ card }: OverviewVisualizationProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );

  const { data: cardData, isLoading: isLoadingCardData } = useGetCardQueryQuery(
    card.id != null ? { cardId: card.id } : skipToken,
  );
  const { data: adhocData, isLoading: isLoadingAdhocData } =
    useGetAdhocQueryQuery(card.id == null ? card.dataset_query : skipToken);
  const data = cardData || adhocData;
  const isLoading = isLoadingCardData || isLoadingAdhocData;

  const rawSeries = useMemo(
    () => (data ? [{ card, data: data.data }] : null),
    [card, data],
  );

  return (
    <DebouncedFrame className={S.root}>
      <QueryVisualization
        className={S.visualization}
        question={question}
        result={data}
        rawSeries={rawSeries}
        queryBuilderMode="dataset" // disable the object details column
        isRunnable={false}
        isRunning={isLoading}
        isDirty
        isResultDirty={false}
      />
    </DebouncedFrame>
  );
}
