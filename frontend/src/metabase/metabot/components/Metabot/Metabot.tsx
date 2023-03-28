import React, { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { Dataset, MetabotFeedbackType, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import { fetchResults } from "../../utils/question";
import MetabotPrompt from "../MetabotPrompt";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import MetabotMessage from "../MetabotMessage";
import MetabotFeedback from "../MetabotFeedback";
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
  const [{ loading, value, error }, handleRun] = useAsyncFn((query: string) =>
    onFetchQuestion(query).then(fetchResults),
  );
  const [feedbackType, setFeedbackType] = useState<MetabotFeedbackType>();
  const isInvalidSql = feedbackType === "invalid-sql";

  useEffect(() => {
    if (initialQuery) {
      handleRun(initialQuery);
    }
  }, [initialQuery, handleRun]);

  return (
    <MetabotRoot>
      <MetabotHeader>
        <MetabotMessage>
          {isInvalidSql
            ? t`Sorry about that. Let me know what the SQL should've been.`
            : title}
        </MetabotMessage>
        <MetabotPrompt
          user={user}
          placeholder={placeholder}
          initialQuery={initialQuery}
          isRunning={loading}
          onRun={handleRun}
        />
      </MetabotHeader>

      {!isInvalidSql && (
        <MetabotQueryBuilder
          question={value?.question}
          results={value?.results}
          loading={loading}
          error={error}
        />
      )}

      {value && !loading ? (
        <MetabotFeedback
          results={value}
          feedbackType={feedbackType}
          onChangeFeedbackType={setFeedbackType}
        />
      ) : null}
    </MetabotRoot>
  );
};

export default Metabot;
