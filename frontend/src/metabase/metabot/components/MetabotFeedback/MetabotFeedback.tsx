import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import type { MetabotFeedbackType } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { runPromptQuery, submitFeedbackForm } from "../../actions";
import { getFeedbackType } from "../../selectors";
import MetabotMessage from "../MetabotMessage";

import { FeedbackContent } from "./MetabotFeedback.styled";

interface StateProps {
  feedbackType: MetabotFeedbackType | null;
}

interface DispatchProps {
  onSubmitFeedback: (feedbackType: MetabotFeedbackType) => void;
  onRetry: () => void;
}

type MetabotFeedbackProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  feedbackType: getFeedbackType(state),
});

const mapDispatchToProps: DispatchProps = {
  onSubmitFeedback: submitFeedbackForm,
  onRetry: () => runPromptQuery(true),
};

const MetabotFeedback = ({
  feedbackType,
  onSubmitFeedback,
  onRetry,
}: MetabotFeedbackProps) => {
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
    <FeedbackContent>
      <MetabotMessage metabotVariant="sad">{t`Sorry, I don't always get things right the first time. I can try again, or you can rephrase your question.`}</MetabotMessage>
      <Button onClick={onRetry}>{t`Try again`}</Button>
    </FeedbackContent>
  );
};

interface FeedbackTypeSelectProps {
  onSubmitFeedback: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeSelect = ({ onSubmitFeedback }: FeedbackTypeSelectProps) => {
  const handleGreat = () => onSubmitFeedback("great");
  const handleWrongData = () => onSubmitFeedback("wrong_data");
  const handleIncorrectResult = () => onSubmitFeedback("incorrect_result");
  const handleInvalidSql = () => onSubmitFeedback("invalid_sql");

  return (
    <FeedbackContent>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <Button onClick={handleGreat}>{t`This is great!`}</Button>
      <Button onClick={handleWrongData}>{t`This used the wrong data.`}</Button>
      <Button onClick={handleIncorrectResult}>
        {t`This result isn’t correct.`}
      </Button>
      <Button onClick={handleInvalidSql}>{t`This isn’t valid SQL.`}</Button>
    </FeedbackContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(MetabotFeedback);
