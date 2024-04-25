import { connect } from "react-redux";
import { t } from "ttag";

import { getResponseErrorMessage } from "metabase/lib/errors";
import type { Dataset } from "metabase-types/api";
import type { MetabotQueryStatus, State } from "metabase-types/store";

import {
  getIsVisualized,
  getQueryError,
  getQueryResults,
  getQueryStatus,
} from "../../selectors";
import MetabotDisplayToggle from "../MetabotDisplayToggle";
import MetabotFeedback from "../MetabotFeedback";
import MetabotQueryEditor from "../MetabotQueryEditor";
import MetabotVisualization from "../MetabotVisualization";

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
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
  isVisualized: boolean;
}

type MetabotQueryBuilderProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  queryStatus: getQueryStatus(state),
  queryResults: getQueryResults(state),
  queryError: getQueryError(state),
  isVisualized: getIsVisualized(state),
});

const MetabotQueryBuilder = ({
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
        <RunningStateRoot />
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
