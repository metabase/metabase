import React from "react";
import { t } from "ttag";
import { Dataset, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import useMetabot from "../../hooks/use-metabot";
import MetabotMessage from "../MetabotMessage";
import MetabotPrompt from "../MetabotPrompt";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { MetabotHeader, MetabotRoot } from "./Metabot.styled";

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
    results,
    isLoading,
    error,
    feedbackType,
    isFeedbackSubmitted,
    handleTextQuerySubmit,
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
      <MetabotHeader>
        <MetabotMessage>
          {feedbackType === "invalid-sql"
            ? t`Sorry about that. Let me know what the SQL should've been.`
            : title}
        </MetabotMessage>
        <MetabotPrompt
          user={user}
          placeholder={placeholder}
          isLoading={isLoading}
          initialQueryText={initialQueryText}
          onTextQuerySubmit={handleTextQuerySubmit}
        />
      </MetabotHeader>

      {hasQueryBuilder && (
        <MetabotQueryBuilder
          question={question}
          results={results}
          isLoading={isLoading}
          error={error}
        />
      )}

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
