import { connect } from "react-redux";

import { checkNotNull } from "metabase/lib/types";
import QuestionDisplayToggle from "metabase/query_builder/components/view/QuestionDisplayToggle";
import type Question from "metabase-lib/v1/Question";
import type { Dispatch, State } from "metabase-types/store";

import { setUIControls } from "../../actions";
import { getIsShowingRawTable, getQuestion } from "../../selectors";

interface StateProps {
  question: Question;
  isShowingRawTable: boolean;
}

interface DispatchProps {
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

type MetabotDisplayToggleProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
  isShowingRawTable: getIsShowingRawTable(state),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onToggleRawTable: isShowingRawTable =>
    dispatch(setUIControls({ isShowingRawTable })),
});

const MetabotDisplayToggle = ({
  question,
  isShowingRawTable,
  onToggleRawTable,
}: MetabotDisplayToggleProps) => {
  return (
    <QuestionDisplayToggle
      question={question}
      isShowingRawTable={isShowingRawTable}
      onToggleRawTable={onToggleRawTable}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MetabotDisplayToggle);
