import { t } from "ttag";

import { PLUGIN_DB_ROUTING, lazyPluginComponent } from "metabase/plugins";
import { Route } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useRedirectDestinationDatabase } from "./hooks";

// The route factory has to exist at boot, because `routes.tsx` builds the
// tree eagerly. The pages behind it do not.
const DatabaseRoutingSection = lazyPluginComponent(() =>
  import("./DatabaseRoutingSection").then(
    ({ DatabaseRoutingSection }) => DatabaseRoutingSection,
  ),
);
const DestinationDatabasesModal = lazyPluginComponent(() =>
  import("./DestinationDatabasesModal").then(
    ({ DestinationDatabasesModal }) => DestinationDatabasesModal,
  ),
);
const DestinationDatabaseConnectionModal = lazyPluginComponent(() =>
  import("./DestinationDatabaseConnectionModal").then(
    ({ DestinationDatabaseConnectionModal }) =>
      DestinationDatabaseConnectionModal,
  ),
);
const RemoveDestinationDatabaseModal = lazyPluginComponent(() =>
  import("./RemoveDestinationDatabaseModal").then(
    ({ RemoveDestinationDatabaseModal }) => RemoveDestinationDatabaseModal,
  ),
);

/**
 * Initialize database_routing plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("database_routing")) {
    PLUGIN_DB_ROUTING.DatabaseRoutingSection = DatabaseRoutingSection;

    PLUGIN_DB_ROUTING.getDatabaseNameFieldProps = (isSlug) => {
      if (!isSlug) {
        return {};
      }

      return {
        label: t`Slug`,
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin settings
        description: t`Metabase will route queries to this database when the user attribute value matches this slug.`, // Metabase will use this value to map to the user attribute you specify to swap queries at run time`,
        placeholder: t`For example, pro-users`,
      };
    };

    PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState = (db) =>
      db.router_user_attribute ? "disabled" : "default";

    PLUGIN_DB_ROUTING.useRedirectDestinationDatabase =
      useRedirectDestinationDatabase;

    PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes = (IsAdmin: any) => (
      <Route path="destination-databases">
        <Route index element={<DestinationDatabasesModal />} />
        <Route element={<IsAdmin />}>
          <Route
            path="create"
            element={<DestinationDatabaseConnectionModal />}
          />
        </Route>
        <Route path=":destinationDatabaseId">
          <Route index element={<DestinationDatabaseConnectionModal />} />
          <Route element={<IsAdmin />}>
            <Route path="remove" element={<RemoveDestinationDatabaseModal />} />
          </Route>
        </Route>
      </Route>
    );
  }
}
