import React from "react";
import { connect } from "react-redux";
import { checkNotNull } from "metabase/core/utils/types";
import QuestionDisplayToggle from "metabase/query_builder/components/view/QuestionDisplayToggle";
import { Dispatch, State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { setUIControls } from "../../actions";
import {
  getIsShowingRawTable,
  getIsVisualized,
  getQuestion,
} from "../../selectors";
import MetabotFeedback from "../MetabotFeedback";
import { QueryFooterRoot } from "./MetabotQueryFooter.styled";

interface StateProps {
  question: Question;
  isVisualized: boolean;
  isShowingRawTable: boolean;
}

interface DispatchProps {
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

type MetabotQueryFooterProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
  isVisualized: getIsVisualized(state),
  isShowingRawTable: getIsShowingRawTable(state),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onToggleRawTable: isShowingRawTable =>
    dispatch(setUIControls({ isShowingRawTable })),
});

const MetabotQueryFooter = ({
  question,
  isVisualized,
  isShowingRawTable,
  onToggleRawTable,
}: MetabotQueryFooterProps) => {
  return (
    <QueryFooterRoot>
      <MetabotFeedback />
      {isVisualized && (
        <QuestionDisplayToggle
          question={question}
          isShowingRawTable={isShowingRawTable}
          onToggleRawTable={onToggleRawTable}
        />
      )}
    </QueryFooterRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotQueryFooter);
