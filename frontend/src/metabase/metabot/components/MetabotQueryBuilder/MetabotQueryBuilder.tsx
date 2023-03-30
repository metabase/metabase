import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { Dataset } from "metabase-types/api";
import { MetabotQueryStatus, State } from "metabase-types/store";
import {
  getQueryError,
  getQueryResults,
  getQueryStatus,
} from "../../selectors";
import MetabotFeedback from "../MetabotFeedback";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotVisualization from "../MetabotVisualization";
import {
  ErrorStateMessage,
  ErrorStateRoot,
  IdleStateIcon,
  IdleStateRoot,
  QueryBuilderRoot,
  RunningStateRoot,
} from "./MetabotQueryBuilder.styled";

interface StateProps {
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
}

type MetabotQueryBuilderProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  queryStatus: getQueryStatus(state),
  queryResults: getQueryResults(state),
  queryError: getQueryError(state),
});

const MetabotQueryBuilder = ({
  queryStatus,
  queryResults,
  queryError,
}: MetabotQueryBuilderProps) => {
  const isRunning = queryStatus === "running";
  const hasResults = queryResults != null;
  const hasErrors = queryError != null;

  return (
    <QueryBuilderRoot>
      {hasResults && <MetabotQueryEditor />}
      {isRunning ? (
        <QueryRunningState />
      ) : hasErrors ? (
        <QueryErrorState queryError={queryError} />
      ) : hasResults ? (
        <MetabotVisualization />
      ) : (
        <QueryIdleState />
      )}
      {hasResults && <MetabotFeedback />}
    </QueryBuilderRoot>
  );
};

const QueryIdleState = () => {
  return (
    <IdleStateRoot>
      <IdleStateIcon name="insight" />
    </IdleStateRoot>
  );
};

const QueryRunningState = () => {
  return <RunningStateRoot loadingMessage={t`Doing science`} />;
};

interface ErrorStateProps {
  queryError: unknown;
}

const QueryErrorState = ({ queryError }: ErrorStateProps) => {
  return (
    <ErrorStateRoot>
      <ErrorStateMessage
        icon="warning"
        message={getResponseErrorMessage(queryError)}
      />
    </ErrorStateRoot>
  );
};

export default connect(mapStateToProps)(MetabotQueryBuilder);
