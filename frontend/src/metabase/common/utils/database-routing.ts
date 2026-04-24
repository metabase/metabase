import type { Card, Dashboard, Database } from "metabase-types/api";

const hasDbRoutingEnabled = (
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
