import { t } from "ttag";

import type {
  Card,
  Dashboard,
  Database,
  DatabaseFeature,
  DatabaseId,
} from "metabase-types/api";

export const isDbModifiable = (
  database:
    | { id?: DatabaseId; is_attached_dwh?: boolean; is_sample?: boolean }
    | undefined,
) => {
  return !(
    database?.id != null &&
    (database.is_attached_dwh || database.is_sample)
  );
};

/**
 * Message explaining why a non-modifiable database cannot be edited. Only
 * meaningful when [[isDbModifiable]] returns false for the same database.
 * The cloud-managed message names Metabase Cloud literally (not the
 * whitelabeled name) so admins can tell platform-managed databases apart from
 * ones managed by their own whitelabeled instance.
 */
export const getDbNotModifiableMessage = (
  database: { is_sample?: boolean } | undefined,
) => {
  return database?.is_sample
    ? t`The sample database cannot be edited.`
    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only: must name Metabase Cloud to distinguish it from a whitelabeled instance
      t`This database is managed by Metabase Cloud and cannot be modified.`;
};

export const hasFeature = (
  database: Pick<Database, "features">,
  feature: DatabaseFeature,
) => {
  return database.features?.includes(feature) ?? false;
};

export const hasActionsEnabled = (database: Pick<Database, "settings">) => {
  return Boolean(database.settings?.["database-enable-actions"]);
};

export const hasWorkspacesEnabled = (database: Pick<Database, "settings">) => {
  return Boolean(database.settings?.["database-enable-workspaces"]);
};

export const hasWritableConnectionDetails = (
  database: Pick<Database, "write_data_details">,
) => {
  return database.write_data_details != null;
};

export const hasAdminConnectionDetails = (
  database: Pick<Database, "admin_details">,
) => {
  return database.admin_details != null;
};

export const hasDbRoutingEnabled = (
  database: Pick<Database, "router_user_attribute">,
) => {
  return !!database.router_user_attribute;
};

/**
 * Check if a question uses a database with routing enabled
 */
export const questionUsesRoutingEnabledDatabase = (
  question: Pick<Card, "database_id">,
  databases: Pick<Database, "id" | "router_user_attribute">[],
) => {
  if (!question.database_id) {
    return false;
  }

  const database = databases.find((db) => db.id === question.database_id);
  return database ? hasDbRoutingEnabled(database) : false;
};

/**
 * Check if a dashboard has any questions that use databases with routing enabled
 */
export const dashboardUsesRoutingEnabledDatabases = (
  dashboard: Pick<Dashboard, "dashcards">,
  databases: Pick<Database, "id" | "router_user_attribute">[],
) => {
  if (!dashboard.dashcards) {
    return false;
  }

  return dashboard.dashcards.some((dashcard) => {
    // Check the main card
    if (
      dashcard.card &&
      questionUsesRoutingEnabledDatabase(dashcard.card, databases)
    ) {
      return true;
    }

    // Check series cards (for questions with multiple series) - only available on QuestionDashboardCard
    if ("series" in dashcard && dashcard.series) {
      return dashcard.series.some((seriesCard: Card) =>
        questionUsesRoutingEnabledDatabase(seriesCard, databases),
      );
    }

    return false;
  });
};

export function hasTableEditingEnabled(database: Pick<Database, "settings">) {
  return Boolean(database.settings?.["database-enable-table-editing"]);
}
