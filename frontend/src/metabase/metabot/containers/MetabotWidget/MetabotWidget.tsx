import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import { Card, CollectionItem, DatabaseId, User } from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import MetabotWidget from "../../components/MetabotWidget";

interface SearchLoaderProps {
  models: CollectionItem[];
}

interface CardLoaderProps {
  card?: Card;
}

interface StateProps {
  user?: User;
  model?: Question;
}

interface DispatchProps {
  onRun: (databaseId: DatabaseId, query: string) => void;
}

const mapStateToProps = (
  state: State,
  { card }: CardLoaderProps,
): StateProps => ({
  user: getUser(state) ?? undefined,
  model: card ? new Question(card, getMetadata(state)) : undefined,
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onRun: (databaseId, query) =>
    dispatch(
      push({
        pathname: `/metabot/database/${databaseId}`,
        query: { query },
      }),
    ),
});

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
