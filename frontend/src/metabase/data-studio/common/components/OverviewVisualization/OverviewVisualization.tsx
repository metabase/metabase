import { useMemo } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { useSelector } from "metabase/lib/redux";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";

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
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );

  const rawSeries = useMemo(
    () => (data ? [{ card, data: data.data }] : null),
    [card, data],
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
