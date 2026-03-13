import { useMemo } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { useSelector } from "metabase/lib/redux";
import { QueryVisualization } from "metabase/query_builder/components/QueryVisualization";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";

import S from "./OverviewVisualization.module.css";
import { useCardQueryData } from "./use-card-query-data";

type OverviewVisualizationProps = {
  card: Card;
  data?: Dataset;
  isLoading?: boolean;
};

export function OverviewVisualization({
  card,
  data: externalData,
  isLoading: externalIsLoading,
}: OverviewVisualizationProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );

  const hasExternalData = externalData !== undefined;
  const { data: internalData, isLoading: internalIsLoading } = useCardQueryData(
    card,
    { skip: hasExternalData },
  );

  const data = hasExternalData ? externalData : internalData;
  const isLoading = hasExternalData
    ? (externalIsLoading ?? false)
    : internalIsLoading;

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
