import { connect } from "react-redux";
import _ from "underscore";
import { LocationDescriptorObject } from "history";
import { checkNotNull } from "metabase/core/utils/types";
import { extractEntityId } from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import Questions from "metabase/entities/questions";
import { Card, CardId } from "metabase-types/api";
import { MetabotEntityType, State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import Metabot from "../../components/Metabot";

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
  entityId: CardId;
  entityType: MetabotEntityType;
  model: Question;
  initialPrompt?: string;
}

const mapStateToProps = (
  state: State,
  { card, params, location }: CardLoaderProps & RouteProps,
): StateProps => {
  const entityId = checkNotNull(extractEntityId(params.slug));

  return {
    entityId,
    entityType: "model",
    model: new Question(card, getMetadata(state)),
    initialPrompt: location?.query?.prompt,
  };
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: (state: State, { params }: RouteProps) => extractEntityId(params.slug),
    entityAlias: "card",
  }),
  connect(mapStateToProps),
)(Metabot);
