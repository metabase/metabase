import type { LocationDescriptorObject } from "history";
import { connect } from "react-redux";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import { checkNotNull } from "metabase/lib/types";
import { extractEntityId } from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import type { CardId } from "metabase-types/api";
import type { MetabotEntityType, State } from "metabase-types/store";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: (state: State, { params }: RouteProps) => extractEntityId(params.slug),
    entityAlias: "model",
  }),
  connect(mapStateToProps),
)(Metabot);
