import React from "react";
import { t, jt } from "ttag";
import { connect } from "react-redux";
import {
  cancelQuery,
  runQuestionQuery,
  updateQuestionOrigin,
} from "metabase/query_builder/actions";
import {
  getFirstQueryResult,
  getIsResultDirty,
  getIsRunning,
  getIsSameOrigin,
} from "metabase/query_builder/selectors";
import { State } from "metabase-types/store";
import {
  EmptyStateBody,
  EmptyStateCaption,
  EmptyStateMessage,
  EmptyStateRoot,
  EmptyStateTitle,
  EmptyStateRunButton,
  EmptyStateLink,
} from "./VisualizationEmptyState.styled";

export interface VisualizationEmptyStateProps {
  className?: string;
  result: unknown;
  isRunning: boolean;
  isSameOrigin: boolean;
  isResultDirty: boolean;
  onRunQuery: () => void;
  onCancelQuery: () => void;
  onUpdateOrigin: () => void;
}

const VisualizationEmptyState = ({
  className,
  result,
  isRunning,
  isSameOrigin,
  isResultDirty,
  onRunQuery,
  onCancelQuery,
  onUpdateOrigin,
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
            {jt`The URL doesn’t look quite right. It could be nothing more than that it’s an old URL, so you can ${(
              <EmptyStateLink key="link" onClick={onUpdateOrigin}>
                {t`try updating it`}
              </EmptyStateLink>
            )}.`}
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
            onRun={onRunQuery}
            onCancel={onCancelQuery}
          />
        </EmptyStateBody>
      )}
    </EmptyStateRoot>
  );
};

const mapStateToProps = (state: State) => ({
  result: getFirstQueryResult(state),
  isRunning: getIsRunning(state),
  isSameOrigin: getIsSameOrigin(state),
  isResultDirty: getIsResultDirty(state),
});

const mapDispatchToProps = {
  onRunQuery: runQuestionQuery,
  onCancelQuery: cancelQuery,
  onUpdateOrigin: updateQuestionOrigin,
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(VisualizationEmptyState);
