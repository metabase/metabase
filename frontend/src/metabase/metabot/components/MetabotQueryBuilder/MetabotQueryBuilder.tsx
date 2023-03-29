import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { Dataset } from "metabase-types/api";
import { MetabotQueryStatus, State } from "metabase-types/store";
import { getQueryResults, getQueryStatus } from "../../selectors";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotVisualization from "../MetabotVisualization";
import {
  IdleStateIcon,
  IdleStateRoot,
  QueryBuilderRoot,
  RunningStateRoot,
} from "./MetabotQueryBuilder.styled";

interface StateProps {
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
}

type MetabotQueryBuilderProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  queryStatus: getQueryStatus(state),
  queryResults: getQueryResults(state),
});

const MetabotQueryBuilder = ({
  queryStatus,
  queryResults,
}: MetabotQueryBuilderProps) => {
  const isIdle = queryStatus === "idle";
  const isRunning = queryStatus === "running";
  const hasResults = queryResults != null;

  return (
    <QueryBuilderRoot>
      {isIdle && <IdleState />}
      {hasResults && <MetabotQueryEditor />}
      {hasResults && !isRunning && <MetabotVisualization />}
      {isRunning && <RunningState />}
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

export default connect(mapStateToProps)(MetabotQueryBuilder);
