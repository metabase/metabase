import React, { useState } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { checkNotNull } from "metabase/core/utils/types";
import ExplicitSize from "metabase/components/ExplicitSize";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { updateCard } from "../../actions";
import { getQuestion } from "../../selectors";

interface OwnProps {
  height: number;
}

interface StateProps {
  question: Question;
}

interface DispatchProps {
  onChange: (question: Question) => void;
}

type MetabotQueryEditorProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
});

const mapDispatchToProps: DispatchProps = {
  onChange: updateCard,
};

const MetabotQueryEditor = ({
  question,
  height,
  onChange,
}: MetabotQueryEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const handleChange = (query: NativeQuery) => onChange(query.question());

  return (
    <NativeQueryEditor
      question={question.setId(-1)}
      query={question.query()}
      viewHeight={height}
      resizable={false}
      hasTopBar={false}
      hasParametersList={false}
      canChangeDatabase={false}
      isInitiallyOpen={false}
      isNativeEditorOpen={isOpen}
      setDatasetQuery={handleChange}
      setIsNativeEditorOpen={setIsOpen}
    />
  );
};

export default _.compose(ExplicitSize)(
  connect(mapStateToProps, mapDispatchToProps),
)(MetabotQueryEditor);
