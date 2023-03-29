import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { checkNotNull } from "metabase/core/utils/types";
import Button from "metabase/core/components/Button";
import { MetabotFeedbackType } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  updateQuestion,
  updateFeedbackType,
  submitQueryForm,
} from "../../actions";
import { getOriginalQuestion, getQuestion } from "../../selectors";
import MetabotQueryEditor from "../MetabotQueryEditor";
import {
  QueryEditorContainer,
  QueryEditorFooter,
  QueryEditorRoot,
  QueryEditorTitle,
} from "./MetabotQueryForm.styled";

interface StateProps {
  question: Question;
  originalQuestion: Question;
}

interface DispatchProps {
  onChangeFeedbackType: (feedbackType: MetabotFeedbackType | null) => void;
  onChangeQuery: (question: Question) => void;
  onSubmitQuery: () => void;
}

type MetabotQueryFormProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: checkNotNull(getQuestion(state)),
  originalQuestion: checkNotNull(getOriginalQuestion(state)),
});

const mapDispatchToProps: DispatchProps = {
  onChangeFeedbackType: updateFeedbackType,
  onChangeQuery: updateQuestion,
  onSubmitQuery: submitQueryForm,
};

export const MetabotQueryForm = ({
  question,
  originalQuestion,
  onChangeFeedbackType,
  onChangeQuery,
  onSubmitQuery,
}: MetabotQueryFormProps) => {
  const handleSubmit = () => onSubmitQuery();
  const handleCancel = () => onChangeFeedbackType(null);

  return (
    <QueryEditorRoot>
      <QueryEditorTitle>{t`Here’s the generated SQL`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor
          question={originalQuestion}
          isReadOnly
          isInitiallyOpen
        />
      </QueryEditorContainer>
      <QueryEditorTitle>{t`What should the SQL have been?`}</QueryEditorTitle>
      <QueryEditorContainer>
        <MetabotQueryEditor
          question={question}
          isInitiallyOpen
          onChange={onChangeQuery}
        />
      </QueryEditorContainer>
      <QueryEditorFooter>
        <Button onClick={handleCancel}>{t`Cancel`}</Button>
        <Button primary onClick={handleSubmit}>{t`Done`}</Button>
      </QueryEditorFooter>
    </QueryEditorRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotQueryForm);
