import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import { Card, CollectionItem, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import HomeMetabot from "../../components/HomeMetabot";

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

const mapStateToProps = (
  state: State,
  { card }: CardLoaderProps,
): StateProps => ({
  user: getUser(state) ?? undefined,
  model: card ? new Question(card, getMetadata(state)) : undefined,
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
  connect(mapStateToProps),
  Databases.load({
    id: (state: State, { model }: StateProps) => model?.databaseId(),
  }),
)(HomeMetabot);
