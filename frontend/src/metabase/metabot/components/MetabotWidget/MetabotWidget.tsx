import React, { useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Search from "metabase/entities/search";
import { getUser } from "metabase/selectors/user";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, CollectionItem, DatabaseId, User } from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import DatabasePicker from "../DatabasePicker";
import MetabotMessage from "../MetabotMessage";
import MetabotPrompt from "../MetabotPrompt";
import { MetabotHeader } from "./MetabotWidget.styled";

interface DatabaseLoaderProps {
  databases: Database[];
}

interface SearchLoaderProps {
  models: CollectionItem[];
}

interface CardLoaderProps {
  card?: Card;
}

interface StateProps {
  user: User | null;
  model: Question | null;
  databases: Database[];
}

interface DispatchProps {
  onSubmitQuery: (databaseId: DatabaseId, query: string) => void;
}

type MetabotWidgetProps = StateProps & DispatchProps & DatabaseLoaderProps;

const mapStateToProps = (
  state: State,
  { card, databases }: CardLoaderProps & DatabaseLoaderProps,
): StateProps => ({
  user: getUser(state),
  model: card ? new Question(card, getMetadata(state)) : null,
  databases: databases.filter(canUseMetabotOnDatabase),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onSubmitQuery: (databaseId, prompt) =>
    dispatch(
      push({ pathname: Urls.databaseMetabot(databaseId), query: { prompt } }),
    ),
});

const MetabotWidget = ({
  databases,
  model,
  user,
  onSubmitQuery,
}: MetabotWidgetProps) => {
  const initialDatabaseId = model?.databaseId() ?? databases[0]?.id;
  const [databaseId, setDatabaseId] = useState(initialDatabaseId);
  const [prompt, setPrompt] = useState("");
  const handleSubmitPrompt = () => onSubmitQuery(databaseId, prompt);

  return (
    <MetabotHeader>
      <MetabotMessage>
        {getGreetingMessage(user)} {t`You can ask me things about your data.`}{" "}
        {databases.length > 1 &&
          jt`I’m thinking about the ${(
            <DatabasePicker
              key="picker"
              databases={databases}
              selectedDatabaseId={databaseId}
              onChange={setDatabaseId}
            />
          )} database right now.`}
      </MetabotMessage>
      <MetabotPrompt
        prompt={prompt}
        placeholder={getPromptPlaceholder(model)}
        user={user}
        onChangePrompt={setPrompt}
        onSubmitPrompt={handleSubmitPrompt}
      />
    </MetabotHeader>
  );
};

const getGreetingMessage = (user: User | null) => {
  if (user?.first_name) {
    return t`Hey there, ${user?.first_name}!`;
  } else {
    return t`Hey there!`;
  }
};

const getPromptPlaceholder = (model: Question | null) => {
  if (model) {
    return t`Ask something like, how many ${model?.displayName()} have we had over time?`;
  } else {
    return t`Ask something…`;
  }
};

export default _.compose(
  Search.loadList({
    query: {
      models: "dataset",
      limit: 1,
    },
    listName: "models",
  }),
  Questions.load({
    id: (state: State, { models }: SearchLoaderProps) => models[0]?.id,
    entityAlias: "card",
  }),
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(MetabotWidget);
