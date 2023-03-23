import { connect } from "react-redux";
import _ from "underscore";

import { push } from "react-router-redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import Databases from "metabase/entities/databases";
import { Card, Database, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import DatabaseMetabot from "metabase/metabot/components/DatabaseMetabot";
import type Metadata from "metabase-lib/metadata/Metadata";

interface RouterParams {
  databaseId?: string;
}

interface CardLoaderProps {
  card: Card;
  params: RouterParams;
}

interface StateProps {
  metadata: Metadata;
  user?: User;
  database?: Database;
}

const getDatabaseId = (params: RouterParams) => {
  return params.databaseId != null ? parseInt(params.databaseId) : null;
};

const mapStateToProps = (
  state: State,
  { params }: CardLoaderProps,
): StateProps => ({
  user: getUser(state) ?? undefined,
  metadata: getMetadata(state),
  database: Databases.selectors.getObject(state, {
    entityId: getDatabaseId(params),
  }),
});

const mapDispatchToProps = {
  onDatabaseChange: (databaseId: number) =>
    push(`/metabot/database/${databaseId}`),
};

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(DatabaseMetabot);
