import type { LocationDescriptorObject } from "history";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import { checkNotNull } from "metabase/lib/types";
import { extractEntityId } from "metabase/lib/urls";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId } from "metabase-types/api";
import type { MetabotEntityType, State } from "metabase-types/store";

import Metabot from "../../components/Metabot";

interface RouterParams {
  databaseId: string;
}

interface RouteProps {
  params: RouterParams;
  location: LocationDescriptorObject;
}

interface DatabaseLoaderProps {
  databases: Database[];
}

interface StateProps {
  entityId: DatabaseId;
  entityType: MetabotEntityType;
  database: Database;
  databases: Database[];
  initialPrompt?: string;
}

const mapStateToProps = (
  state: State,
  { params, location, databases }: RouteProps & DatabaseLoaderProps,
): StateProps => {
  const entityId = checkNotNull(extractEntityId(params.databaseId));

  return {
    entityId,
    entityType: "database",
    database: Databases.selectors.getObject(state, { entityId }),
    databases: databases.filter(canUseMetabotOnDatabase),
    initialPrompt: location?.query?.prompt,
  };
};

const mapDispatchToProps = {
  onDatabaseChange: (databaseId: DatabaseId) =>
    push(`/metabot/database/${databaseId}`),
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(Metabot);
