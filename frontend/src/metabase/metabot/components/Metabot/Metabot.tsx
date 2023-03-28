import React, { useEffect } from "react";
import { useAsyncFn } from "react-use";
import { User } from "metabase-types/api";
import MetabotPrompt from "../MetabotPrompt";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import { MetabotHeader, MetabotRoot } from "../MetabotLayout";
import MetabotResultsWrapper from "../MetabotResultsWrapper";
import MetabotMessage from "../MetabotMessage";

import { MetabotFeedbackContainer } from "../MetabotMessage/MetabotMessage.styled";
import { QueryResults } from "./types";
import { useFeedbackFlow } from "./use-feedback-flow";

export interface MetabotProps {
  user?: User;
  initialQuery?: string;
  placeholder: string;
  initialGreeting: React.ReactNode;
  onFetchResults: (query: string) => Promise<QueryResults>;
}

const Metabot = ({
  user,
  initialQuery,
  initialGreeting,
  placeholder,
  onFetchResults,
}: MetabotProps) => {
  const [{ loading, value, error }, handleRun] = useAsyncFn(onFetchResults);

  const { feedbackContent, isQueryFormVisible } = useFeedbackFlow(
    loading ? undefined : value,
  );

  useEffect(() => {
    if (initialQuery) {
      handleRun(initialQuery);
    }
  }, [initialQuery, handleRun]);

  return (
    <MetabotRoot>
      <MetabotHeader>
        <MetabotMessage>{initialGreeting}</MetabotMessage>
        <MetabotPrompt
          user={user}
          placeholder={placeholder}
          initialQuery={initialQuery}
          isRunning={loading}
          onRun={handleRun}
        />
      </MetabotHeader>

      {!isQueryFormVisible && (
        <MetabotResultsWrapper loading={loading} error={error} data={value}>
          {({ question, results }) => (
            <MetabotQueryBuilder question={question} results={results} />
          )}
        </MetabotResultsWrapper>
      )}

      {feedbackContent != null ? (
        <MetabotFeedbackContainer>{feedbackContent}</MetabotFeedbackContainer>
      ) : null}
    </MetabotRoot>
  );
};

export default Metabot;
