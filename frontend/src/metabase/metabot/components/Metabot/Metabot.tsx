import React, { useEffect } from "react";
import { connect } from "react-redux";
import { MetabotFeedbackType } from "metabase-types/api";
import {
  Dispatch,
  MetabotEntityId,
  MetabotEntityType,
  MetabotQueryStatus,
  State,
} from "metabase-types/store";
import { getFeedbackType, getQueryStatus } from "../../selectors";
import MetabotHeader from "../MetabotHeader";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { MetabotRoot } from "./Metabot.styled";

interface OwnProps {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialQueryText?: string;
}

interface StateProps {
  queryStatus: MetabotQueryStatus;
  feedbackType: MetabotFeedbackType | null;
}

interface DispatchProps {
  onInit: (props: OwnProps) => void;
  onReset: () => void;
}

type MetabotProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  queryStatus: getQueryStatus(state),
  feedbackType: getFeedbackType(state),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onInit: () => undefined,
  onReset: () => undefined,
});

const Metabot = ({
  entityId,
  entityType,
  initialQueryText,
  queryStatus,
  feedbackType,
  onInit,
  onReset,
}: MetabotProps) => {
  useEffect(() => {
    onInit({ entityId, entityType, initialQueryText });
    return () => onReset();
  }, [entityId, entityType, initialQueryText, onInit, onReset]);

  const isLoading = queryStatus === "running";
  const isInvalidSql = feedbackType === "invalid-sql";

  return (
    <MetabotRoot>
      <MetabotHeader />
      {isInvalidSql ? <MetabotQueryForm /> : <MetabotQueryBuilder />}
      {!isLoading && !isInvalidSql && <MetabotFeedbackForm />}
    </MetabotRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Metabot);
