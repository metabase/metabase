import React from "react";
import { t } from "ttag";
import { VisualizationRunningState } from "metabase/query_builder/components/QueryVisualization";
import MetabotEmptyState from "../MetabotEmptyState";
import { ErrorState, ErrorWrapperRoot } from "./MetabotResultsWrapper.styled";

interface Props<T> {
  children: (value: NonNullable<T>) => React.ReactNode;
  loading?: boolean;
  error?: Error;
  data?: T;
}

const MetabotResultsWrapper = <T,>({
  loading,
  error,
  data,
  children,
}: Props<T>) => {
  if (loading) {
    return (
      <VisualizationRunningState
        className="flex-full"
        loadingMessage={t`Doing science...`}
      />
    );
  }

  if (error != null) {
    const errorMessage =
      (error as any)?.data?.message ?? t`Something went wrong. Try again.`;

    return (
      <ErrorWrapperRoot>
        <ErrorState message={errorMessage} icon="warning" />
      </ErrorWrapperRoot>
    );
  }

  if (data != null) {
    return <>{children(data)}</>;
  }

  return <MetabotEmptyState />;
};

export default MetabotResultsWrapper;
