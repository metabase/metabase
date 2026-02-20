import { t } from "ttag";

import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";
import { useRedirectDestinationDatabase } from "./hooks";

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

    PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes = (_IsAdmin: any) => null;
  }
}
