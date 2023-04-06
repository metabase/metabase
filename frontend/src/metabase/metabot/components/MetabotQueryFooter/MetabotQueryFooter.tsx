import React from "react";
import { connect } from "react-redux";
import { checkNotNull } from "metabase/core/utils/types";
import QuestionDisplayToggle from "metabase/query_builder/components/view/QuestionDisplayToggle";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import { getQuestion } from "../../selectors";
import MetabotFeedback from "../MetabotFeedback";
import { QueryFooterRoot } from "./MetabotQueryFooter.styled";

interface StateProps {
  question: Question;
  isShowingRawTable: boolean;
}

interface DispatchProps {
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

type MetabotQueryFooterProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
  isShowingRawTable: true,
});

const mapDispatchToProps = (): DispatchProps => ({
  onToggleRawTable: () => undefined,
});

const MetabotQueryFooter = ({
  question,
  isShowingRawTable,
  onToggleRawTable,
}: MetabotQueryFooterProps) => {
  return (
    <QueryFooterRoot>
      <MetabotFeedback />
      <QuestionDisplayToggle
        question={question}
        isShowingRawTable={isShowingRawTable}
        onToggleRawTable={onToggleRawTable}
      />
    </QueryFooterRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotQueryFooter);
