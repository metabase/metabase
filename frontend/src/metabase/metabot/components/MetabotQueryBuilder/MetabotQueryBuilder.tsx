import { connect } from "react-redux";
import { t } from "ttag";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { Dataset } from "metabase-types/api";
import { MetabotQueryStatus, State } from "metabase-types/store";
import {
  getIsVisualized,
  getQueryError,
  getQueryResults,
  getQueryStatus,
} from "../../selectors";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotVisualization from "../MetabotVisualization";
import MetabotFeedback from "../MetabotFeedback";
import MetabotDisplayToggle from "../MetabotDisplayToggle";
import {
  ErrorStateMessage,
  ErrorStateRoot,
  QueryFooterRoot,
  IdleStateIcon,
  IdleStateRoot,
  QueryBuilderRoot,
  RunningStateRoot,
} from "./MetabotQueryBuilder.styled";

interface StateProps {
  loadingMessage: string;
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
  isVisualized: boolean;
}

type MetabotQueryBuilderProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  loadingMessage: PLUGIN_SELECTORS.getLoadingMessage(state),
  queryStatus: getQueryStatus(state),
  queryResults: getQueryResults(state),
  queryError: getQueryError(state),
  isVisualized: getIsVisualized(state),
});

const MetabotQueryBuilder = ({
  loadingMessage,
  queryStatus,
  queryResults,
  queryError,
  isVisualized,
}: MetabotQueryBuilderProps) => {
  const isRunning = queryStatus === "running";
  const hasResults = queryResults != null;
  const hasErrors = queryError != null;

  return (
    <QueryBuilderRoot>
      {hasResults && <MetabotQueryEditor />}
      {isRunning ? (
        <QueryRunningState loadingMessage={loadingMessage} />
      ) : hasErrors ? (
        <QueryErrorState queryError={queryError} />
      ) : hasResults ? (
        <MetabotVisualization />
      ) : (
        <QueryIdleState />
      )}
      {hasResults && <QueryFooter isVisualized={isVisualized} />}
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

interface QueryRunningStateProps {
  loadingMessage: string;
}

const QueryRunningState = ({ loadingMessage }: QueryRunningStateProps) => {
  return <RunningStateRoot loadingMessage={loadingMessage} />;
};

interface QueryErrorStateProps {
  queryError: unknown;
}

const QueryErrorState = ({ queryError }: QueryErrorStateProps) => {
  return (
    <ErrorStateRoot>
      <ErrorStateMessage
        icon="warning"
        message={getResponseErrorMessage(queryError) ?? t`An error occurred`}
      />
    </ErrorStateRoot>
  );
};

interface QueryFooterProps {
  isVisualized: boolean;
}

const QueryFooter = ({ isVisualized }: QueryFooterProps) => {
  return (
    <QueryFooterRoot>
      <MetabotFeedback />
      {isVisualized && <MetabotDisplayToggle />}
    </QueryFooterRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(MetabotQueryBuilder);
