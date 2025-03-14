import { IndexRoute, Route } from "react-router";

import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { RemoveRoutedDatabaseModal } from "./RemoveRoutedDatabasesModal";
import { RoutedDatabaseConnectionModal } from "./RoutedDatabaseConnectionModal";
import { RoutedDatabasesModal } from "./RoutedDatabasesModal";

// TODO: remove force conditional once feature is enabled on monday
if (!!true || hasPremiumFeature("database_routing")) {
  PLUGIN_DB_ROUTING.mirrorDatabaseRoutes = (
    <>
      <Route path="mirrors" component={RoutedDatabasesModal} />
      <Route path="mirror">
        <Route path="create" component={RoutedDatabaseConnectionModal} />
        <Route path=":mirrorDatabaseId">
          <IndexRoute component={RoutedDatabaseConnectionModal} />
          <Route path="remove" component={RemoveRoutedDatabaseModal} />
        </Route>
      </Route>
    </>
  );

  PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;
}
