import type { ActionDashboardCard } from "metabase-types/api";

export function isActionDashboardCard(
  dashcard: unknown,
): dashcard is ActionDashboardCard {
  return "action" in (dashcard as ActionDashboardCard);
}
