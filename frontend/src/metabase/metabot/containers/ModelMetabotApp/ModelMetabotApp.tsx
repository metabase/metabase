import { connect } from "react-redux";
import _ from "underscore";
import { LocationDescriptorObject } from "history";
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

interface RouteProps {
  params: RouterParams;
  location: LocationDescriptorObject;
}

interface CardLoaderProps {
  card: Card;
}

interface StateProps {
  model: Question;
  user?: User;
  initialQueryText?: string;
}

const getModelId = (state: State, { params }: RouteProps) => {
  return extractEntityId(params.slug);
};

const mapStateToProps = (
  state: State,
  { card, location }: CardLoaderProps & RouteProps,
): StateProps => ({
  model: new Question(card, getMetadata(state)),
  user: getUser(state) ?? undefined,
  initialQueryText: location?.query?.query,
});

export default _.compose(
  Questions.load({ id: getModelId, entityAlias: "card" }),
  connect(mapStateToProps),
)(ModelMetabot);
