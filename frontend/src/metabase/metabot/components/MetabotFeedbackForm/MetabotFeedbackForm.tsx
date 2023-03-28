import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import FormProvider from "metabase/core/components/FormProvider";
import { MetabotFeedbackType } from "metabase-types/api";
import { Dispatch, MetabotFeedbackStatus, State } from "metabase-types/store";
import { getFeedbackStatus, getFeedbackType } from "../../selectors";
import MetabotMessage from "../MetabotMessage";
import {
  FormRoot,
  FormSection,
  InlineForm,
  InlineFormInput,
  InlineFormSubmitButton,
} from "./MetabotFeedbackForm.styled";

interface StateProps {
  feedbackType: MetabotFeedbackType | null;
  feedbackStatus: MetabotFeedbackStatus;
}

interface DispatchProps {
  onChangeFeedback: (feedbackType: MetabotFeedbackType) => void;
  onSubmitFeedback: (feedbackMessage: string) => void;
}

type MetabotFeedbackFormProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  feedbackType: getFeedbackType(state),
  feedbackStatus: getFeedbackStatus(state),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onChangeFeedback: () => undefined,
  onSubmitFeedback: () => undefined,
});

const MetabotFeedbackForm = ({
  feedbackType,
  feedbackStatus,
  onChangeFeedback,
  onSubmitFeedback,
}: MetabotFeedbackFormProps) => {
  return (
    <FormRoot>
      <FeedbackFormContent
        feedbackType={feedbackType}
        feedbackStatus={feedbackStatus}
        onChangeFeedback={onChangeFeedback}
        onSubmitFeedback={onSubmitFeedback}
      />
    </FormRoot>
  );
};

const FeedbackFormContent = ({
  feedbackType,
  feedbackStatus,
  onChangeFeedback,
  onSubmitFeedback,
}: MetabotFeedbackFormProps) => {
  if (feedbackStatus === "complete") {
    return <MetabotMessage>{t`Thanks for the feedback!`}</MetabotMessage>;
  }

  switch (feedbackType) {
    case "great":
      return <MetabotMessage>{t`Glad to hear it!`}</MetabotMessage>;
    case "wrong-data":
      return (
        <FeedbackMessageForm
          title={t`What data should it have used?`}
          placeholder={t`Type the name of the data it should have used.`}
          onSubmit={onSubmitFeedback}
        />
      );
    case "incorrect-result":
      return (
        <FeedbackMessageForm
          title={t`Sorry about that.`}
          placeholder={t`Describe what’s wrong`}
          onSubmit={onSubmitFeedback}
        />
      );
    default:
      return <FeedbackTypeSelect onChangeFeedback={onChangeFeedback} />;
  }
};

interface FeedbackTypeSelectProps {
  onChangeFeedback: (type: MetabotFeedbackType) => void;
}

const FeedbackTypeSelect = ({ onChangeFeedback }: FeedbackTypeSelectProps) => {
  const handleGreat = () => onChangeFeedback("great");
  const handleWrongData = () => onChangeFeedback("wrong-data");
  const handleIncorrectResult = () => onChangeFeedback("incorrect-result");
  const handleInvalidSql = () => onChangeFeedback("invalid-sql");

  return (
    <FormSection>
      <MetabotMessage>{t`How did I do?`}</MetabotMessage>
      <Button onClick={handleGreat}>{t`This is great!`}</Button>
      <Button onClick={handleWrongData}>{t`This used the wrong data.`}</Button>
      <Button onClick={handleIncorrectResult}>
        {t`This result isn’t correct.`}
      </Button>
      <Button onClick={handleInvalidSql}>{t`This isn’t valid SQL.`}</Button>
    </FormSection>
  );
};

interface FeedbackFormValues {
  message: string;
}

interface FeedbackMessageFormProps {
  title: string;
  placeholder: string;
  onSubmit: (message: string) => void;
}

const FeedbackMessageForm = ({
  title,
  placeholder,
  onSubmit,
}: FeedbackMessageFormProps) => {
  const initialValues = { message: "" };
  const handleSubmit = ({ message }: FeedbackFormValues) => onSubmit(message);

  return (
    <FormSection>
      <MetabotMessage>{title}</MetabotMessage>
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ dirty }) => (
          <InlineForm disabled={!dirty}>
            <InlineFormInput name="message" placeholder={placeholder} />
            <InlineFormSubmitButton title="" icon="check" primary />
          </InlineForm>
        )}
      </FormProvider>
    </FormSection>
  );
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(MetabotFeedbackForm);
