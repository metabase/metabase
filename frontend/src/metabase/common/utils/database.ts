import { t } from "ttag";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, Dashboard, Database, DatabaseId } from "metabase-types/api";

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

export const hasActionsEnabled = (database: Pick<Database, "settings">) => {
  return Boolean(database.settings?.["database-enable-actions"]);
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
 * Whether this database refuses anonymous traffic: routing is on, and no admin
 * has allowed anonymous access to the router database. An anonymous visitor has
 * no user attribute to route by, so a public link on such a database could never
 * return data and the API refuses to create one.
 */
export const refusesAnonymousAccess = (
  database: Pick<
    Database,
    "router_user_attribute" | "router_anonymous_access_granted"
  >,
) => {
  return (
    hasDbRoutingEnabled(database) && !database.router_anonymous_access_granted
  );
};

/**
 * The ids of the databases a dashboard's cards query, including the cards added
 * to its dashcards as series.
 */
export const getDashboardDatabaseIds = (
  dashboard: Pick<Dashboard, "dashcards">,
): DatabaseId[] => {
  return (dashboard.dashcards ?? [])
    .flatMap((dashcard) => [
      dashcard.card,
      ...("series" in dashcard ? (dashcard.series ?? []) : []),
    ])
    .map((card) => card?.database_id)
    .filter((databaseId): databaseId is DatabaseId => databaseId != null);
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
  return getDashboardDatabaseIds(dashboard).some((databaseId) => {
    const database = databases.find((db) => db.id === databaseId);
    return database ? hasDbRoutingEnabled(database) : false;
  });
};

export function hasTableEditingEnabled(database: Pick<Database, "settings">) {
  return Boolean(database.settings?.["database-enable-table-editing"]);
}

/**
 * Match a database by exact (case-sensitive) name, ignoring the virtual
 * "Saved Questions" database; on a name collision the lowest id wins.
 */
export const findDatabaseByName = (databases: Database[], name: string) =>
  databases
    .filter(
      (database) =>
        database.name === name && database.id !== SAVED_QUESTIONS_VIRTUAL_DB_ID,
    )
    .sort((a, b) => a.id - b.id)[0];
