import { useMemo } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
  error?: unknown;
  className?: string;
};

function getQueryErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error != null &&
    "status" in error &&
    error.status === 403
  ) {
    return t`Sorry, you don’t have permission to see that.`;
  }

  return getErrorMessage(error, t`An error occurred`);
}

export function MetricCardVisualization({
  card,
  data,
  isLoading,
  error,
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
      {error ? (
        <LoadingAndErrorWrapper
          error={error}
          renderError={() => getQueryErrorMessage(error)}
        />
      ) : (
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
      )}
    </DebouncedFrame>
  );
}

type OverviewVisualizationProps = {
  card: Card;
};

export function OverviewVisualization({ card }: OverviewVisualizationProps) {
  const { data, isLoading, error } = useCardQueryData(card);

  return (
    <MetricCardVisualization
      card={card}
      data={data}
      isLoading={isLoading}
      error={error}
    />
  );
}
