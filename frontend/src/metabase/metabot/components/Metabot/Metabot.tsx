import React, { useEffect } from "react";
import { connect } from "react-redux";
import { MetabotFeedbackType } from "metabase-types/api";
import {
  MetabotEntityId,
  MetabotEntityType,
  MetabotQueryStatus,
  State,
} from "metabase-types/store";
import { init, reset } from "../../actions";
import { getFeedbackType, getQueryStatus } from "../../selectors";
import MetabotHeader from "../MetabotHeader";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { MetabotRoot } from "./Metabot.styled";

interface OwnProps {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialQueryText: string;
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

const mapDispatchToProps: DispatchProps = {
  onInit: init,
  onReset: reset,
};

const Metabot = ({
  entityId,
  entityType,
  initialQueryText = "",
  queryStatus,
  feedbackType,
  onInit,
  onReset,
}: MetabotProps) => {
  useEffect(() => {
    onInit({ entityId, entityType, initialQueryText });
    return () => onReset();
  }, [entityId, entityType, initialQueryText, onInit, onReset]);

  const isIdle = queryStatus === "idle";
  const isInvalidSql = feedbackType === "invalid-sql";

  return (
    <MetabotRoot>
      <MetabotHeader />
      {isInvalidSql ? <MetabotQueryForm /> : <MetabotQueryBuilder />}
      {!isIdle && !isInvalidSql && <MetabotFeedbackForm />}
    </MetabotRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Metabot);
