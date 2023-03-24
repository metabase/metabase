import React, { useCallback } from "react";
import { useAsyncFn } from "react-use";
import { jt, t } from "ttag";
import { MetabotApi } from "metabase/services";
import { User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import ModelLink from "../ModelLink";
import MetabotPrompt from "../MetabotPrompt";
import MetabotGreeting from "../MetabotGreeting";
import {
  MetabotHeader,
  MetabotResultsSkeleton,
  MetabotRoot,
} from "../MetabotLayout";
import MetabotQueryBuilder from "../MetabotQueryBuilder";

interface ModelMetabotProps {
  model: Question;
  user?: User;
}

const ModelMetabot = ({ model, user }: ModelMetabotProps) => {
  const [{ value, loading }, run] = useAsyncFn(getQuestionAndResults);

  const handleRun = useCallback(
    (query: string) => {
      run(model, query);
    },
    [model, run],
  );

  return (
    <MetabotRoot>
      <MetabotHeader>
        <MetabotGreeting>{getGreetingMessage(model, user)}</MetabotGreeting>
        <MetabotPrompt
          user={user}
          placeholder={gePromptPlaceholder(model)}
          isRunning={loading}
          onRun={handleRun}
        />
      </MetabotHeader>
      {value ? (
        <MetabotQueryBuilder
          question={value.question}
          results={value.results}
        />
      ) : (
        <MetabotResultsSkeleton display="bar" isStatic={!loading} />
      )}
    </MetabotRoot>
  );
};

const getGreetingMessage = (model: Question, user?: User) => {
  const link = <ModelLink model={model} />;
  const name = user?.first_name;

  return name
    ? jt`What do you want to know about ${link}, ${name}?`
    : jt`What do you want to know about ${link}?`;
};

const gePromptPlaceholder = (model: Question) => {
  return t`Ask something like, how many ${model.displayName()} have we had over time?`;
};

const getQuestionAndResults = async (model: Question, query: string) => {
  const card = await MetabotApi.modelPrompt({
    modelId: model.id(),
    question: query,
  });
  const question = new Question(card, model.metadata());
  const results = await question.apiGetResults();

  return { question, results };
};

export default ModelMetabot;
