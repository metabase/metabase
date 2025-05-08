import { IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { DestinationDatabaseConnectionModal } from "./DestinationDatabaseConnectionModal";
import { DestinationDatabasesModal } from "./DestinationDatabasesModal";
import { RemoveDestinationDatabaseModal } from "./RemoveDestinationDatabaseModal";
import { useRedirectDestinationDatabase } from "./hooks";

if (hasPremiumFeature("database_routing")) {
  PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;

  PLUGIN_DB_ROUTING.getDatabaseNameFieldProps = (isSlug) => {
    if (!isSlug) {
      return {};
    }

    return {
      title: t`Slug`,
      // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
      description: t`Metabase maps this value to your chosen user attribute to swap queries at runtime`, // Metabase will use this value to map to the user attribute you specify to swap queries at run time`,
      placeholder: t`E.g. pro-users`,
    };
  };

  PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState = (db) =>
    db.router_user_attribute ? "disabled" : "default";

  PLUGIN_DB_ROUTING.useRedirectDestinationDatabase =
    useRedirectDestinationDatabase;

  PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes = (IsAdmin: any) => (
    <Route path="destination-databases">
      <IndexRoute component={DestinationDatabasesModal} />
      <Route component={IsAdmin}>
        <Route path="create" component={DestinationDatabaseConnectionModal} />
      </Route>
      <Route path=":destinationDatabaseId">
        <IndexRoute component={DestinationDatabaseConnectionModal} />
        <Route component={IsAdmin}>
          <Route path="remove" component={RemoveDestinationDatabaseModal} />
        </Route>
      </Route>
    </Route>
  );
}
