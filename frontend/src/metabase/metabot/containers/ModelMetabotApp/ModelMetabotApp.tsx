import { connect } from "react-redux";
import _ from "underscore";
import { LocationDescriptorObject } from "history";
import { checkNotNull } from "metabase/core/utils/types";
import { extractEntityId } from "metabase/lib/urls";
import Questions from "metabase/entities/questions";
import { CardId } from "metabase-types/api";
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
  model: Question;
}

interface StateProps {
  entityId: CardId;
  entityType: MetabotEntityType;
  initialPrompt?: string;
}

const mapStateToProps = (
  state: State,
  { params, location }: CardLoaderProps & RouteProps,
): StateProps => {
  const entityId = checkNotNull(extractEntityId(params.slug));

  return {
    entityId,
    entityType: "model",
    initialPrompt: location?.query?.prompt,
  };
};

export default _.compose(
  Questions.load({
    id: (state: State, { params }: RouteProps) => extractEntityId(params.slug),
    entityAlias: "model",
  }),
  connect(mapStateToProps),
)(Metabot);
