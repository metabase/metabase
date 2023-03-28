import { connect } from "react-redux";
import _ from "underscore";
import type { LocationDescriptorObject } from "history";
import { push } from "react-router-redux";
import { checkNotNull } from "metabase/core/utils/types";
import { extractEntityId } from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import { DatabaseId } from "metabase-types/api";
import { MetabotEntityType, State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import Metabot from "../../components/Metabot";

interface RouterParams {
  databaseId: string;
}

interface RouteProps {
  params: RouterParams;
  location: LocationDescriptorObject;
}

interface StateProps {
  entityId: DatabaseId;
  entityType: MetabotEntityType;
  database: Database;
  initialQueryText?: string;
}

const mapStateToProps = (
  state: State,
  { params, location }: RouteProps,
): StateProps => {
  const entityId = checkNotNull(extractEntityId(params.databaseId));

  return {
    entityId,
    entityType: "database",
    database: Databases.selectors.getObject(state, { entityId }),
    initialQueryText: location?.query?.query,
  };
};

const mapDispatchToProps = {
  onDatabaseChange: (databaseId: DatabaseId) =>
    push(`/metabot/database/${databaseId}`),
};

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(Metabot);
