import { connect } from "react-redux";
import _ from "underscore";

import { push } from "react-router-redux";
import { getUser } from "metabase/selectors/user";
import Databases from "metabase/entities/databases";
import { Card, Database, DatabaseId, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import DatabaseMetabot from "metabase/metabot/components/DatabaseMetabot";
import { LocationDescriptor } from "metabase-types/types";

interface RouterParams {
  databaseId?: string;
}

interface CardLoaderProps {
  card: Card;
  params: RouterParams;
  location: LocationDescriptor;
}

interface StateProps {
  user?: User;
  database?: Database;
  initialQuery?: string;
}

const getDatabaseId = (params: RouterParams) => {
  return params.databaseId != null ? parseInt(params.databaseId) : null;
};

const mapStateToProps = (
  state: State,
  { params, location }: CardLoaderProps,
): StateProps => ({
  user: getUser(state) ?? undefined,
  database: Databases.selectors.getObject(state, {
    entityId: getDatabaseId(params),
  }),
  initialQuery: location?.query?.query,
});

const mapDispatchToProps = {
  onDatabaseChange: (databaseId: DatabaseId) =>
    push(`/metabot/database/${databaseId}`),
};

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(DatabaseMetabot);
