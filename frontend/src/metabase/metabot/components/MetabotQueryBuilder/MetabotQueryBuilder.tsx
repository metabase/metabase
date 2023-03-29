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
import MetabotFeedbackForm from "../MetabotFeedbackForm";
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
  const isIdle = queryStatus === "idle";
  const isRunning = queryStatus === "running";
  const hasResults = queryResults != null;
  const hasErrors = queryError != null;

  return (
    <QueryBuilderRoot>
      {isIdle && <IdleState />}
      {hasResults && <MetabotQueryEditor />}
      {hasResults && !isRunning && <MetabotVisualization />}
      {isRunning && <RunningState />}
      {hasErrors && <ErrorState queryError={queryError} />}
      {hasResults && <MetabotFeedbackForm />}
    </QueryBuilderRoot>
  );
};

const IdleState = () => {
  return (
    <IdleStateRoot>
      <IdleStateIcon name="insight" />
    </IdleStateRoot>
  );
};

const RunningState = () => {
  return <RunningStateRoot loadingMessage={t`Doing science`} />;
};

interface ErrorStateProps {
  queryError: unknown;
}

const ErrorState = ({ queryError }: ErrorStateProps) => {
  return (
    <ErrorStateRoot>
      <ErrorStateMessage>
        {getResponseErrorMessage(queryError)}
      </ErrorStateMessage>
    </ErrorStateRoot>
  );
};

export default connect(mapStateToProps)(MetabotQueryBuilder);
