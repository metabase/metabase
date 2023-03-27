import React, { useEffect } from "react";
import { useAsyncFn } from "react-use";
import { Dataset, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import MetabotPrompt from "../MetabotPrompt";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import { MetabotHeader, MetabotRoot } from "../MetabotLayout";
import MetabotResultsWrapper from "../MetabotResultsWrapper";
import MetabotMessage from "../MetabotMessage";

interface QueryResults {
  question: Question;
  results: [Dataset];
}

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
      <MetabotResultsWrapper loading={loading} error={error} data={value}>
        {({ question, results }) => (
          <MetabotQueryBuilder question={question} results={results} />
        )}
      </MetabotResultsWrapper>
    </MetabotRoot>
  );
};

export default Metabot;
