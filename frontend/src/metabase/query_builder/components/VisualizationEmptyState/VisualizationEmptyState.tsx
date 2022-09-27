import React from "react";
import { t } from "ttag";
import {
  EmptyStateBody,
  EmptyStateCaption,
  EmptyStateMessage,
  EmptyStateRoot,
  EmptyStateTitle,
  EmptyStateRunButton,
} from "./VisualizationEmptyState.styled";

export interface VisualizationEmptyStateProps {
  className?: string;
  result: unknown;
  isRunning: boolean;
  isSameOrigin: boolean;
  isResultDirty: boolean;
  runQuestionQuery: () => void;
  cancelQuery: () => void;
}

const VisualizationEmptyState = ({
  className,
  result,
  isRunning,
  isSameOrigin,
  isResultDirty,
  runQuestionQuery,
  cancelQuery,
}: VisualizationEmptyStateProps): JSX.Element => {
  return (
    <EmptyStateRoot className={className}>
      {isSameOrigin ? (
        <EmptyStateCaption>
          {t`Here's where your results will appear`}
        </EmptyStateCaption>
      ) : (
        <EmptyStateBody>
          <EmptyStateTitle>
            {t`This query looks a little fishy`}
          </EmptyStateTitle>
          <EmptyStateMessage>
            {t`The URL doesn’t look quite right. It could be nothing more than that it’s an old URL, so you can try updating it.`}
          </EmptyStateMessage>
          <EmptyStateMessage>
            {t`But before you run this query, make sure you trust where this link came from, then go ahead and run the query.`}
          </EmptyStateMessage>
          <EmptyStateRunButton
            circular
            compact
            result={result}
            isRunning={isRunning}
            isDirty={isResultDirty}
            onRun={() => runQuestionQuery()}
            onCancel={() => cancelQuery()}
          />
        </EmptyStateBody>
      )}
    </EmptyStateRoot>
  );
};

export default VisualizationEmptyState;
