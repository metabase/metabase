import { connect } from "react-redux";
import _ from "underscore";
import { push } from "react-router-redux";
import { checkNotNull } from "metabase/core/utils/types";
import { getUser } from "metabase/home/selectors";
import { Card } from "metabase-types/api";
import { State } from "metabase-types/store";

import Databases from "metabase/entities/databases";

import HomeMetabotWidget from "../../components/HomeMetabotWidget";

interface Props {
  model: Card;
}

const mapStateToProps = (state: State) => ({
  user: checkNotNull(getUser(state)),
});

const mapDispatchToProps = {
  onRun: (prompt: string, databaseId: number) =>
    push(`metabot/database/${databaseId}?prompt=${prompt}`),
};

export default _.compose(
  Databases.load({
    id: (_state: State, { model }: Props) => model?.dataset_query?.database,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(HomeMetabotWidget);
