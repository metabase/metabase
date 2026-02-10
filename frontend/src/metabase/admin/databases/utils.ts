import type {
  Card,
  Dashboard,
  Database,
  DatabaseFeature,
  DatabaseId,
} from "metabase-types/api";

export const isDbModifiable = (
  database: { id?: DatabaseId; is_attached_dwh?: boolean } | undefined,
) => {
  return !(database?.id != null && database.is_attached_dwh);
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
