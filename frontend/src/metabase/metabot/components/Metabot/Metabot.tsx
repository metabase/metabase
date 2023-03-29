import React, { useEffect } from "react";
import { connect } from "react-redux";
import { MetabotFeedbackType } from "metabase-types/api";
import {
  MetabotEntityId,
  MetabotEntityType,
  MetabotQueryStatus,
  State,
} from "metabase-types/store";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import { init, InitPayload, reset } from "../../actions";
import {
  getFeedbackType,
  getQueryStatus,
  hasQueryResults,
} from "../../selectors";
import MetabotHeader from "../MetabotHeader";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { MetabotRoot } from "./Metabot.styled";

interface OwnProps {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialPrompt?: string;
  model?: Question;
  database?: Database;
  databases?: Database[];
}

interface StateProps {
  queryStatus: MetabotQueryStatus;
  feedbackType: MetabotFeedbackType | null;
  hasQueryResults: boolean;
}

interface DispatchProps {
  onInit: (payload: InitPayload) => void;
  onReset: () => void;
}

type MetabotProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  queryStatus: getQueryStatus(state),
  feedbackType: getFeedbackType(state),
  hasQueryResults: hasQueryResults(state),
});

const mapDispatchToProps: DispatchProps = {
  onInit: init,
  onReset: reset,
};

const Metabot = ({
  entityId,
  entityType,
  initialPrompt,
  model,
  database,
  databases,
  queryStatus,
  feedbackType,
  hasQueryResults,
  onInit,
  onReset,
}: MetabotProps) => {
  useEffect(() => {
    onInit({ entityId, entityType, initialPrompt });
    return () => onReset();
  }, [entityId, entityType, initialPrompt, onInit, onReset]);

  const isCompleted = queryStatus === "complete";
  const isInvalidSql = feedbackType === "invalid-sql";
  const hasFeedbackForm = isCompleted && !isInvalidSql && hasQueryResults;

  return (
    <MetabotRoot>
      <MetabotHeader model={model} database={database} databases={databases} />
      {isInvalidSql ? <MetabotQueryForm /> : <MetabotQueryBuilder />}
      {hasFeedbackForm && <MetabotFeedbackForm />}
    </MetabotRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Metabot);
