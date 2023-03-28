import { connect } from "react-redux";
import _ from "underscore";
import { jt, t } from "ttag";
import React, { useCallback } from "react";
import { extractEntityId } from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import Questions from "metabase/entities/questions";
import { Card, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Metabot from "metabase/metabot/components/Metabot";
import { MetabotApi } from "metabase/services";
import { getMetabotQuestionResults } from "metabase/metabot/utils/question";
import ModelLink from "metabase/metabot/components/ModelLink";
import Question from "metabase-lib/Question";

type ModelMetabotAppProps = StateProps;

const ModelMetabotApp = ({ model, user }: ModelMetabotAppProps) => {
  const handleFetchResults = useCallback(
    async (prompt: string) => {
      const card = await MetabotApi.modelPrompt({
        modelId: model.id(),
        question: prompt,
      });
      const results = await getMetabotQuestionResults(card, model.metadata());
      return { ...results, prompt };
    },
    [model],
  );

  return (
    <Metabot
      user={user}
      initialGreeting={getInitialGreeting(model, user)}
      placeholder={t`Ask something like, how many ${model.displayName()} have we had over time?`}
      onFetchResults={handleFetchResults}
    />
  );
};

const getInitialGreeting = (model: Question, user?: User) => {
  const link = <ModelLink model={model} />;
  const name = user?.first_name;

  return name
    ? jt`What do you want to know about ${link}, ${name}?`
    : jt`What do you want to know about ${link}?`;
};

interface RouterParams {
  slug: string;
}

interface OwnProps {
  params: RouterParams;
}

interface CardLoaderProps {
  card: Card;
}

interface StateProps {
  model: Question;
  user?: User;
}

const getModelId = (state: State, { params }: OwnProps) => {
  return extractEntityId(params.slug);
};

const mapStateToProps = (
  state: State,
  { card }: CardLoaderProps,
): StateProps => ({
  model: new Question(card, getMetadata(state)),
  user: getUser(state) ?? undefined,
});

export default _.compose(
  Questions.load({ id: getModelId, entityAlias: "card" }),
  connect(mapStateToProps),
)(ModelMetabotApp);
