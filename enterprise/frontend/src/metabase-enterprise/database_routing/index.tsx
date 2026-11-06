import { t } from "ttag";

import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { Route } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { featureGatedComponent } from "metabase-enterprise/settings/feature-gated-route";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { DestinationDatabaseConnectionModal } from "./DestinationDatabaseConnectionModal";
import { DestinationDatabasesModal } from "./DestinationDatabasesModal";
import { RemoveDestinationDatabaseModal } from "./RemoveDestinationDatabaseModal";
import { useRedirectDestinationDatabase } from "./hooks";

const GatedDestinationDatabasesModal = featureGatedComponent(
  "database_routing",
  DestinationDatabasesModal,
);

const GatedDestinationDatabaseConnectionModal = featureGatedComponent(
  "database_routing",
  DestinationDatabaseConnectionModal,
);

const GatedRemoveDestinationDatabaseModal = featureGatedComponent(
  "database_routing",
  RemoveDestinationDatabaseModal,
);

/**
 * Initialize database_routing plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes = (IsAdmin: any) => (
    <Route path="destination-databases">
      <Route index element={<GatedDestinationDatabasesModal />} />
      <Route element={<IsAdmin />}>
        <Route
          path="create"
          element={<GatedDestinationDatabaseConnectionModal />}
        />
      </Route>
      <Route path=":destinationDatabaseId">
        <Route index element={<GatedDestinationDatabaseConnectionModal />} />
        <Route element={<IsAdmin />}>
          <Route
            path="remove"
            element={<GatedRemoveDestinationDatabaseModal />}
          />
        </Route>
      </Route>
    </Route>
  );

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
  }
}
