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
  initialQuery?: string;
  onFetchQuestion: (query: string) => Promise<Question>;
}

const Metabot = ({
  title,
  placeholder,
  user,
  initialQuery,
  onFetchQuestion,
}: MetabotProps) => {
  const {
    query,
    question,
    results,
    isLoading,
    error,
    feedbackType,
    handleQueryChange,
    handleQuerySubmit,
    handleFeedbackTypeChange,
    handleFeedbackSubmit,
  } = useMetabot({
    initialQuery,
    onFetchQuestion,
  });

  return (
    <MetabotRoot>
      <MetabotHeader>
        <MetabotMessage>
          {feedbackType === "invalid-sql"
            ? t`Sorry about that. Let me know what the SQL should've been.`
            : title}
        </MetabotMessage>
        <MetabotPrompt
          query={query}
          user={user}
          placeholder={placeholder}
          isLoading={isLoading}
          onQueryChange={handleQueryChange}
          onQuerySubmit={handleQuerySubmit}
        />
      </MetabotHeader>

      {feedbackType !== "invalid-sql" && (
        <MetabotQueryBuilder
          question={question}
          results={results}
          isLoading={isLoading}
          error={error}
        />
      )}

      {question && feedbackType === "invalid-sql" && (
        <MetabotQueryForm
          question={question}
          onFeedbackTypeChange={handleFeedbackTypeChange}
          onSubmit={() => undefined}
        />
      )}

      {question && feedbackType !== "invalid-sql" && (
        <MetabotFeedbackForm
          feedbackType={feedbackType}
          isSubmitted={false}
          onFeedbackTypeChange={handleFeedbackTypeChange}
          onFeedbackSubmit={handleFeedbackSubmit}
        />
      )}
    </MetabotRoot>
  );
};

export default Metabot;
