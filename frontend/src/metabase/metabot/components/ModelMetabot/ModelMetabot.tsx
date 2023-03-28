import React from "react";
import { jt, t } from "ttag";
import { MetabotApi } from "metabase/services";
import { User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import ModelLink from "../ModelLink";
import Metabot from "../Metabot";

interface ModelMetabotProps {
  model: Question;
  user?: User;
  initialQueryText?: string;
}

const ModelMetabot = ({ model, user, initialQueryText }: ModelMetabotProps) => {
  const handleFetch = async (query: string) => {
    const card = await MetabotApi.modelPrompt({
      modelId: model.id(),
      question: query,
    });

    return new Question(card, model.metadata());
  };

  return (
    <Metabot
      title={getTitle(model, user)}
      placeholder={getPlaceholder(model)}
      user={user}
      initialQueryText={initialQueryText}
      onFetchQuestion={handleFetch}
    />
  );
};

const getTitle = (model: Question, user?: User) => {
  const link = <ModelLink model={model} />;
  const name = user?.first_name;

  return name
    ? jt`What do you want to know about ${link}, ${name}?`
    : jt`What do you want to know about ${link}?`;
};

const getPlaceholder = (model: Question) => {
  return t`Ask something like, how many ${model.displayName()} have we had over time?`;
};

export default ModelMetabot;
