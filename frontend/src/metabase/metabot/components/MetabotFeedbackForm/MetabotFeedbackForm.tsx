import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { MetabotFeedbackType } from "metabase-types/api";
import { State } from "metabase-types/store";
import { runPromptQuery, submitFeedbackForm } from "../../actions";
import { getFeedbackType } from "../../selectors";
import MetabotMessage from "../MetabotMessage";
import {
  FeedbackOptions,
  FormRoot,
  FormSection,
} from "./MetabotFeedbackForm.styled";

interface StateProps {
  feedbackType: MetabotFeedbackType | null;
}

interface DispatchProps {
  onSubmitFeedback: (feedbackType: MetabotFeedbackType) => void;
  onRetry: () => void;
}

type MetabotFeedbackFormProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  feedbackType: getFeedbackType(state),
});

const mapDispatchToProps: DispatchProps = {
  onSubmitFeedback: submitFeedbackForm,
  onRetry: () => runPromptQuery(),
};

const MetabotFeedbackForm = ({
  feedbackType,
  onSubmitFeedback,
  onRetry,
}: MetabotFeedbackFormProps) => {
  return (
    <FormRoot>
      <FeedbackFormContent
        feedbackType={feedbackType}
        onSubmitFeedback={onSubmitFeedback}
        onRetry={onRetry}
      />
    </FormRoot>
  );
};

const FeedbackFormContent = ({
  feedbackType,
  onSubmitFeedback,
  onRetry,
}: MetabotFeedbackFormProps) => {
  if (!feedbackType) {
    return <FeedbackTypeSelect onSubmitFeedback={onSubmitFeedback} />;
  }

  if (feedbackType === "great") {
    return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
  }

  return <FeedbackRetrySuggestion onRetry={onRetry} />;
};

interface FeedbackRetrySuggestionProps {
  onRetry: () => void;
}

const FeedbackRetrySuggestion = ({ onRetry }: FeedbackRetrySuggestionProps) => {
  return (
    <FormSection>
      <MetabotMessage>{t`Sorry, I don't always get things right the first time. I can try again, or you can rephrase your question.`}</MetabotMessage>
      <Button onClick={onRetry}>{t`Try again`}</Button>
    </FormSection>
  );
};

interface FeedbackTypeSelectProps {
  onSubmitFeedback: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeSelect = ({ onSubmitFeedback }: FeedbackTypeSelectProps) => {
  const handleGreat = () => onSubmitFeedback("great");
  const handleWrongData = () => onSubmitFeedback("wrong-data");
  const handleIncorrectResult = () => onSubmitFeedback("incorrect-result");
  const handleInvalidSql = () => onSubmitFeedback("invalid-sql");

  return (
    <FormSection>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <FeedbackOptions>
        <Button onClick={handleGreat}>{t`This is great!`}</Button>
        <Button
          onClick={handleWrongData}
        >{t`This used the wrong data.`}</Button>
        <Button onClick={handleIncorrectResult}>
          {t`This result isn’t correct.`}
        </Button>
        <Button onClick={handleInvalidSql}>{t`This isn’t valid SQL.`}</Button>
      </FeedbackOptions>
    </FormSection>
  );
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MetabotFeedbackForm);
