import { connect } from "react-redux";
import _ from "underscore";
import { extractEntityId } from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import Questions from "metabase/entities/questions";
import { Card, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import ModelMetabot from "../../components/ModelMetabot";

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
  Questions.load({ id: getModelId }),
  connect(mapStateToProps),
)(ModelMetabot);
