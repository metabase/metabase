import React from "react";
import { Dataset, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import useMetabot from "../../hooks/use-metabot";
import MetabotHeader from "../MetabotHeader";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { MetabotRoot } from "./Metabot.styled";

export interface QueryResults {
  prompt: string;
  question: Question;
  results: [Dataset];
}

export interface MetabotProps {
  title: React.ReactNode;
  placeholder: string;
  user?: User;
  initialQueryText?: string;
  onFetchQuestion: (query: string) => Promise<Question>;
}

const Metabot = ({
  title,
  placeholder,
  user,
  initialQueryText,
  onFetchQuestion,
}: MetabotProps) => {
  const {
    question,
    feedbackType,
    isFeedbackSubmitted,
    handleNativeQuerySubmit,
    handleFeedbackChange,
    handleFeedbackSubmit,
  } = useMetabot({
    initialQueryText,
    onFetchQuestion,
  });

  const isInvalidSql = feedbackType === "invalid-sql";
  const hasQueryBuilder = !isInvalidSql || isFeedbackSubmitted;
  const hasQueryForm = isInvalidSql && !isFeedbackSubmitted;
  const hasFeedbackForm = question != null && !hasQueryForm;

  return (
    <MetabotRoot>
      <MetabotHeader />
      {hasQueryBuilder && <MetabotQueryBuilder />}

      {question && hasQueryForm && (
        <MetabotQueryForm
          question={question}
          onFeedbackChange={handleFeedbackChange}
          onNativeQuerySubmit={handleNativeQuerySubmit}
        />
      )}

      {hasFeedbackForm && (
        <MetabotFeedbackForm
          feedbackType={feedbackType}
          isFeedbackSubmitted={isFeedbackSubmitted}
          onFeedbackChange={handleFeedbackChange}
          onFeedbackSubmit={handleFeedbackSubmit}
        />
      )}
    </MetabotRoot>
  );
};

export default Metabot;
