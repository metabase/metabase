import { connect } from "react-redux";
import _ from "underscore";
import type { LocationDescriptorObject } from "history";
import { push } from "react-router-redux";
import { extractEntityId } from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import { getUser } from "metabase/selectors/user";
import { DatabaseId, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import DatabaseMetabot from "../../components/DatabaseMetabot";

interface RouterParams {
  databaseId: string;
}

interface RouteProps {
  params: RouterParams;
  location: LocationDescriptorObject;
}

interface StateProps {
  user?: User;
  database?: Database;
  initialQuery?: string;
}

const mapStateToProps = (
  state: State,
  { params, location }: RouteProps,
): StateProps => ({
  database: Databases.selectors.getObject(state, {
    entityId: extractEntityId(params.databaseId),
  }),
  user: getUser(state) ?? undefined,
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
