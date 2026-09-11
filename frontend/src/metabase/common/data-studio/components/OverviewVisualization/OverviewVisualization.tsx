import { useMemo } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { useQuestionFromCard } from "metabase/metadata-store";
import { QueryVisualization } from "metabase/querying/components/QueryVisualization";
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
  const buildQuestion = useQuestionFromCard();
  const question = useMemo(() => buildQuestion(card), [card, buildQuestion]);

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
