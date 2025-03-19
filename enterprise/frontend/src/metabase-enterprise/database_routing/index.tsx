import { IndexRoute, Route } from "react-router";

import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { DestinationDatabaseConnectionModal } from "./DestinationDatabaseConnectionModal";
import { DestinationDatabasesModal } from "./DestinationDatabasesModal";
import { RemoveDestinationDatabaseModal } from "./RemoveDestinationDatabaseModal";

if (hasPremiumFeature("database_routing")) {
  PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;

  PLUGIN_DB_ROUTING.destinationDatabaseRoutes = (
    <Route path="destination-databases">
      <IndexRoute component={DestinationDatabasesModal} />
      <Route path="create" component={DestinationDatabaseConnectionModal} />
      <Route path=":destinationDatabaseId">
        <IndexRoute component={DestinationDatabaseConnectionModal} />
        <Route path="remove" component={RemoveDestinationDatabaseModal} />
      </Route>
    </Route>
  );
}
