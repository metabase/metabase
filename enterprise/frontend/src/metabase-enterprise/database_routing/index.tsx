import { Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { RoutedDatabaseConnectionModal } from "./RoutedDatabaseConnectionModal";
import { RoutedDatabasesModal } from "./RoutedDatabasesModal";

// TODO: double check on name, it's hyphenated in the notion doc
// TODO: get this feature enabled / working
if (!!true || hasPremiumFeature("database_routing")) {
  PLUGIN_DB_ROUTING.mirrorDatabaseRoutes = (
    <>
      <ModalRoute path="mirrors" modal={RoutedDatabasesModal} noWrap />
      <Route path="mirror">
        <ModalRoute
          path="create"
          modal={RoutedDatabaseConnectionModal}
          noWrap
        />
        <ModalRoute
          path=":mirrorDatabaseId"
          modal={RoutedDatabaseConnectionModal}
          noWrap
        />
      </Route>
    </>
  );

  PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;
}
