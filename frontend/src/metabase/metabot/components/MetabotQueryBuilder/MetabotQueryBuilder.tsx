import React from "react";
import { t } from "ttag";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotVisualization from "../MetabotVisualization";
import {
  EmptyStateIcon,
  EmptyStateRoot,
  ErrorStateMessage,
  ErrorStateRoot,
  LoadingState,
  QueryStateRoot,
} from "./MetabotQueryBuilder.styled";

interface MetabotQueryBuilderProps {
  question?: Question;
  results?: [Dataset];
  isLoading?: boolean;
  error?: unknown;
}

const MetabotQueryBuilder = ({
  question,
  results,
  isLoading,
  error,
}: MetabotQueryBuilderProps) => {
  if (isLoading) {
    return <LoadingState loadingMessage={t`Doing science...`} />;
  }

  if (error) {
    return (
      <ErrorStateRoot>
        <ErrorStateMessage
          message={getResponseErrorMessage(error)}
          icon="warning"
        />
      </ErrorStateRoot>
    );
  }

  if (!question || !results) {
    return (
      <EmptyStateRoot>
        <EmptyStateIcon name="insight" />
      </EmptyStateRoot>
    );
  }

  return (
    <QueryStateRoot>
      <MetabotQueryEditor question={question} isReadOnly hasTopbar />
      <MetabotVisualization question={question} results={results} />
    </QueryStateRoot>
  );
};

export default MetabotQueryBuilder;
