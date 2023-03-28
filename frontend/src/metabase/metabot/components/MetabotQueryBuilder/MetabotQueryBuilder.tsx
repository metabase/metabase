import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { Dataset } from "metabase-types/api";
import { MetabotQueryStatus, State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  getQueryError,
  getQueryResults,
  getQueryStatus,
  getQuestion,
} from "../../selectors";
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
  queryStatus?: MetabotQueryStatus;
  queryResults?: [Dataset];
  queryError?: unknown;
}

const mapStateToProps = (state: State): MetabotQueryBuilderProps => ({
  question: getQuestion(state),
  queryStatus: getQueryStatus(state),
  queryResults: getQueryResults(state),
  queryError: getQueryError(state),
});

const MetabotQueryBuilder = ({
  question,
  queryStatus,
  queryResults,
  queryError,
}: MetabotQueryBuilderProps) => {
  if (queryStatus === "running") {
    return <LoadingState loadingMessage={t`Doing science...`} />;
  }

  if (queryError) {
    return (
      <ErrorStateRoot>
        <ErrorStateMessage
          message={getResponseErrorMessage(queryError)}
          icon="warning"
        />
      </ErrorStateRoot>
    );
  }

  if (!question || !queryResults) {
    return (
      <EmptyStateRoot>
        <EmptyStateIcon name="insight" />
      </EmptyStateRoot>
    );
  }

  return (
    <QueryStateRoot>
      <MetabotQueryEditor question={question} isReadOnly hasTopbar />
      <MetabotVisualization question={question} queryResults={queryResults} />
    </QueryStateRoot>
  );
};

export default connect(mapStateToProps)(MetabotQueryBuilder);
