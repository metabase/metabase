import { useMemo } from "react";

import { useGetCardQueryQuery } from "metabase/api";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import { useSelector } from "metabase/lib/redux";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import S from "./VisualizationSection.css";

type CardOverviewVisualizationProps = {
  className?: string;
  card: Card;
};

export function CardOverviewVisualization({
  className,
  card,
}: CardOverviewVisualizationProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );

  const { data, isLoading } = useGetCardQueryQuery({ cardId: card.id });
  const rawSeries = useMemo(
    () => (data ? [{ card, data: data.data }] : null),
    [card, data],
  );

  return (
    <DebouncedFrame className={S.root}>
      <QueryVisualization
        className={className}
        question={question}
        result={data}
        rawSeries={rawSeries}
        isRunnable={false}
        isRunning={isLoading}
        isDirty
        isResultDirty={false}
      />
    </DebouncedFrame>
  );
}
